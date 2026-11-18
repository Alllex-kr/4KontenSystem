/**
 * finAPI-Anbindung (Access API v2 + Web Form 2.0).
 *
 * Stand der Prüfung (18.11.2026, offizielle Doku + OpenAPI-Datei des Web Form 2.0):
 *   BESTÄTIGT  Web Form: POST /api/webForms/bankConnectionImport, GET /api/webForms/{id},
 *              Status NOT_YET_OPENED | IN_PROGRESS | COMPLETED | COMPLETED_WITH_ERROR | EXPIRED | ABORTED | CANCELLED,
 *              payload.bankConnectionId, Felder accountTypes / maxDaysForDownload / redirectUrl (nur HTTPS) / allowTestBank,
 *              Aktualisieren über POST /api/tasks/backgroundUpdate + GET /api/tasks/{id} (Status … WEB_FORM_REQUIRED, payload.webForm.url),
 *              Rücksprung-Parameter redirectUrl / errorRedirectUrl / abortRedirectUrl / language an der Formular-URL.
 *   BESTÄTIGT  Access: OAuth2 client_credentials und password-Grant, POST users mit id/password/isAutoUpdateEnabled,
 *              GET /api/v2/bankConnections/{id}, GET /api/v2/accounts.
 *   UNBESTÄTIGT (aus Erfahrung, die Access-Spezifikation war nicht abrufbar):
 *              Pfad /api/v2/oauth/token (Fallback /oauth/token), POST /api/v2/users, GET /api/v2/transactions
 *              mit accountIds/minBankBookingDate/page/perPage/view, DELETE /api/v2/bankConnections/{id},
 *              Feldnamen der Konten (accountName, iban, balance, accountCurrency, accountType)
 *              und Umsätze (amount, bankBookingDate, purpose, counterpartName).
 *   → Bitte mit den finAPI-Sandbox-Zugangsdaten einmal durchtesten (siehe docs/BANKANBINDUNG.md).
 */
import type { BankProvider, ProviderAccount, ProviderContext, ProviderTransaction, UpdateCheck } from "./types";

export interface IdentityStore {
  get(userId: string): Promise<{ externalUserId: string; secret: string } | null>;
  save(userId: string, externalUserId: string, secret: string): Promise<void>;
}

export interface FinapiConfig {
  clientId: string;
  clientSecret: string;
  env: "sandbox" | "live";
  fetch?: typeof fetch;
  store: IdentityStore;
  newUserId: () => string;
  newPassword: () => string;
}

export class FinapiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function createFinapiProvider(cfg: FinapiConfig): BankProvider {
  const http = cfg.fetch ?? fetch;
  const access = cfg.env === "live" ? "https://live.finapi.io" : "https://sandbox.finapi.io";
  const webform = cfg.env === "live" ? "https://webform-live.finapi.io" : "https://webform-sandbox.finapi.io";
  let clientToken: { token: string; until: number } | null = null;
  const userTokens = new Map<string, { token: string; until: number }>();
  let tokenPath = "/api/v2/oauth/token";

  async function readError(res: Response): Promise<string> {
    try {
      const body = await res.json();
      const msg = body?.errors?.[0]?.message ?? body?.message ?? body?.error_description ?? body?.error;
      if (msg) return String(msg);
    } catch {
      /* kein JSON */
    }
    return `finAPI antwortet mit HTTP ${res.status}`;
  }

  async function requestToken(params: Record<string, string>) {
    const body = new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...params });
    let res = await http(`${access}${tokenPath}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    if (res.status === 404 && tokenPath !== "/oauth/token") {
      tokenPath = "/oauth/token";
      res = await http(`${access}${tokenPath}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    }
    if (!res.ok) throw new FinapiError(await readError(res), res.status);
    const json = (await res.json()) as { access_token: string; expires_in?: number };
    return { token: json.access_token, until: Date.now() + Math.max(60, (json.expires_in ?? 3600) - 60) * 1000 };
  }

  async function getClientToken() {
    if (!clientToken || clientToken.until < Date.now()) clientToken = await requestToken({ grant_type: "client_credentials" });
    return clientToken.token;
  }

  /** finAPI-User zum Vierklee-Nutzer holen oder anlegen. */
  async function identity(userId: string) {
    const existing = await cfg.store.get(userId);
    if (existing) return existing;
    const externalUserId = cfg.newUserId();
    const secret = cfg.newPassword();
    const res = await http(`${access}/api/v2/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getClientToken()}` },
      body: JSON.stringify({ id: externalUserId, password: secret, isAutoUpdateEnabled: false }),
    });
    if (!res.ok) throw new FinapiError(`finAPI-Benutzer konnte nicht angelegt werden: ${await readError(res)}`, res.status);
    await cfg.store.save(userId, externalUserId, secret);
    return { externalUserId, secret };
  }

  async function getUserToken(userId: string) {
    const cached = userTokens.get(userId);
    if (cached && cached.until > Date.now()) return cached.token;
    const id = await identity(userId);
    const t = await requestToken({ grant_type: "password", username: id.externalUserId, password: id.secret });
    userTokens.set(userId, t);
    return t.token;
  }

  async function call<T>(ctx: ProviderContext, url: string, init: RequestInit = {}): Promise<T> {
    const res = await http(url, {
      ...init,
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}), Authorization: `Bearer ${await getUserToken(ctx.userId)}` },
    });
    if (!res.ok) throw new FinapiError(await readError(res), res.status);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** Rücksprung nach dem Web-Formular (funktioniert auch mit http://localhost). */
  function withRedirect(url: string, returnUrl: string) {
    const u = new URL(url);
    u.searchParams.set("redirectUrl", returnUrl);
    u.searchParams.set("errorRedirectUrl", returnUrl);
    u.searchParams.set("abortRedirectUrl", returnUrl);
    u.searchParams.set("language", "de");
    return u.toString();
  }

  return {
    id: "finapi",
    label: cfg.env === "live" ? "finAPI" : "finAPI Sandbox",
    sandbox: cfg.env !== "live",

    async startImport(ctx, { returnUrl }) {
      const form = await call<{ id: string; url: string }>(ctx, `${webform}/api/webForms/bankConnectionImport`, {
        method: "POST",
        body: JSON.stringify({
          accountTypes: ["CHECKING", "SAVINGS"],
          maxDaysForDownload: 365,
          allowTestBank: cfg.env !== "live",
          ...(returnUrl.startsWith("https://") ? { redirectUrl: returnUrl } : {}),
        }),
      });
      return { redirectUrl: withRedirect(form.url, returnUrl), pendingFormId: form.id };
    },

    async checkImport(ctx, formId) {
      const form = await call<{ status: string; payload?: { bankConnectionId?: number | null; errorMessage?: string | null } }>(
        ctx,
        `${webform}/api/webForms/${encodeURIComponent(formId)}`,
      );
      if (form.status === "COMPLETED" && form.payload?.bankConnectionId) {
        const connId = String(form.payload.bankConnectionId);
        const conn = await call<{ updateStatus?: string; bank?: { name?: string } }>(ctx, `${access}/api/v2/bankConnections/${connId}`);
        if (conn?.updateStatus === "IN_PROGRESS") return { status: "pending", message: "Die Bank liefert gerade deine Konten …" };
        return { status: "completed", externalConnectionId: connId, bankName: conn?.bank?.name ?? "Bank" };
      }
      if (["COMPLETED_WITH_ERROR", "ABORTED", "EXPIRED", "CANCELLED"].includes(form.status)) {
        const reason: Record<string, string> = { ABORTED: "Die Verbindung wurde abgebrochen.", EXPIRED: "Das Formular ist abgelaufen (20 Minuten).", CANCELLED: "Das Formular wurde abgebrochen." };
        return { status: "failed", message: form.payload?.errorMessage || reason[form.status] || "Die Bank hat die Verbindung abgelehnt." };
      }
      return { status: "pending" };
    },

    async startUpdate(ctx, externalConnectionId) {
      const task = await call<{ id: string }>(ctx, `${webform}/api/tasks/backgroundUpdate`, {
        method: "POST",
        body: JSON.stringify({ bankConnectionId: Number(externalConnectionId) }),
      });
      return { taskId: task.id };
    },

    async checkUpdate(ctx, taskId, { returnUrl }): Promise<UpdateCheck> {
      const task = await call<{ status: string; payload?: { webForm?: { url?: string } | null; errorMessage?: string | null } }>(
        ctx,
        `${webform}/api/tasks/${encodeURIComponent(taskId)}`,
      );
      if (task.status === "COMPLETED") return { status: "completed" };
      if (task.status === "WEB_FORM_REQUIRED" && task.payload?.webForm?.url) return { status: "webform", redirectUrl: withRedirect(task.payload.webForm.url, returnUrl) };
      if (task.status === "COMPLETED_WITH_ERROR") return { status: "failed", message: task.payload?.errorMessage || "Aktualisierung fehlgeschlagen." };
      return { status: "pending" };
    },

    async listAccounts(ctx, externalConnectionId) {
      const res = await call<{ accounts?: FinapiAccount[] }>(ctx, `${access}/api/v2/accounts?bankConnectionIds=${encodeURIComponent(externalConnectionId)}`);
      return (res?.accounts ?? []).map(mapFinapiAccount);
    },

    async listTransactions(ctx, accountIds, since) {
      if (!accountIds.length) return [];
      const out: ProviderTransaction[] = [];
      for (let page = 1; page <= 20; page++) {
        const q = new URLSearchParams({ view: "userView", accountIds: accountIds.join(","), minBankBookingDate: since, page: String(page), perPage: "500", order: "bankBookingDate,desc" });
        const res = await call<{ transactions?: FinapiTransaction[]; paging?: { pageCount?: number } }>(ctx, `${access}/api/v2/transactions?${q}`);
        out.push(...(res?.transactions ?? []).map(mapFinapiTransaction));
        if (!res?.paging?.pageCount || page >= res.paging.pageCount) break;
      }
      return out;
    },

    async deleteConnection(ctx, externalConnectionId) {
      await call(ctx, `${access}/api/v2/bankConnections/${encodeURIComponent(externalConnectionId)}`, { method: "DELETE" });
    },
  };
}

// ---------- Mapping (Feldnamen siehe Hinweis oben)

export interface FinapiAccount {
  id: number | string;
  accountName?: string | null;
  accountHolderName?: string | null;
  iban?: string | null;
  balance?: number | null;
  accountCurrency?: string | null;
  accountType?: string | null;
}

export interface FinapiTransaction {
  id: number | string;
  accountId: number | string;
  amount: number;
  bankBookingDate?: string | null;
  valueDate?: string | null;
  purpose?: string | null;
  counterpartName?: string | null;
}

export function mapFinapiAccount(a: FinapiAccount): ProviderAccount {
  return {
    externalId: String(a.id),
    name: a.accountName || a.accountHolderName || "Konto",
    iban: a.iban ?? null,
    balanceCents: typeof a.balance === "number" ? Math.round(a.balance * 100) : null,
    currency: a.accountCurrency || "EUR",
    type: a.accountType ?? null,
  };
}

export function mapFinapiTransaction(t: FinapiTransaction): ProviderTransaction {
  return {
    externalId: String(t.id),
    externalAccountId: String(t.accountId),
    date: (t.bankBookingDate || t.valueDate || "").slice(0, 10),
    amountCents: Math.round(Number(t.amount) * 100),
    payee: (t.counterpartName ?? "").replace(/\s+/g, " ").trim(),
    purpose: (t.purpose ?? "").replace(/\s+/g, " ").trim(),
  };
}
