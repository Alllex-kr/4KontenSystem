import { describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret, randomToken } from "./crypto";
import { DEMO_ACCOUNTS, demoProvider, demoTransactions } from "./demo";
import { createFinapiProvider, mapFinapiAccount, mapFinapiTransaction, type IdentityStore } from "./finapi";
import { bankHash, planSync, syncSince } from "./sync";
import { maskIban } from "./types";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("Verschlüsselung", () => {
  it("verschlüsselt und entschlüsselt", () => {
    const enc = encryptSecret("geheim123", KEY);
    expect(enc).not.toContain("geheim");
    expect(decryptSecret(enc, KEY)).toBe("geheim123");
  });
  it("erkennt Manipulation", () => {
    const enc = encryptSecret("geheim123", KEY).split(":");
    enc[3] = Buffer.from("x" + Buffer.from(enc[3], "base64url").toString("latin1")).toString("base64url");
    expect(() => decryptSecret(enc.join(":"), KEY)).toThrow();
  });
  it("lehnt falsche Schlüssellänge ab", () => {
    expect(() => encryptSecret("a", Buffer.alloc(16).toString("base64"))).toThrow(/32 Byte/);
  });
  it("erzeugt zufällige Tokens", () => {
    expect(randomToken(32)).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(randomToken(32)).not.toBe(randomToken(32));
  });
});

describe("Demo-Bank", () => {
  it("liefert stabile Umsätze für denselben Zeitraum", () => {
    const ids = DEMO_ACCOUNTS("abc").map((a) => a.externalId);
    const a = demoTransactions(ids, "2026-09-01", new Date(2026, 10, 18));
    const b = demoTransactions(ids, "2026-09-01", new Date(2026, 10, 18));
    expect(a).toEqual(b);
    expect(a.some((t) => t.payee.includes("Werkstudenten") && t.amountCents === 95000)).toBe(true);
    expect(new Set(a.map((t) => t.externalId)).size).toBe(a.length);
  });
  it("Freigabe-Status", async () => {
    const ctx = { userId: "u", connectionId: "c1" };
    expect((await demoProvider.checkImport(ctx, "demo-c1")).status).toBe("pending");
    expect(await demoProvider.checkImport(ctx, "done:c1")).toMatchObject({ status: "completed", externalConnectionId: "c1" });
    expect((await demoProvider.checkImport(ctx, "aborted:c1")).status).toBe("failed");
  });
});

describe("Synchronisierung", () => {
  const txs = [
    { externalId: "1", externalAccountId: "A", date: "2026-11-10", amountCents: -2347, payee: "REWE Markt", purpose: "Karte" },
    { externalId: "2", externalAccountId: "A", date: "2026-11-11", amountCents: 95000, payee: "Arbeitgeber", purpose: "Gehalt" },
    { externalId: "3", externalAccountId: "B", date: "2026-11-11", amountCents: -100, payee: "X", purpose: "" },
    { externalId: "1", externalAccountId: "A", date: "2026-11-10", amountCents: -2347, payee: "REWE Markt", purpose: "Karte" },
  ];
  it("übernimmt nur zugeordnete, neue Umsätze und kategorisiert sie", () => {
    const plan = planSync("demo", txs, new Map([["A", "vk-fix"]]), new Set([bankHash("demo", "2")]), []);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ accountId: "vk-fix", amountCents: -2347, category: "Lebensmittel", description: "REWE Markt · Karte" });
  });
  it("Zeitraum: erstmalig 90 Tage, danach mit 7 Tagen Puffer", () => {
    const now = new Date(2026, 10, 18, 12);
    expect(syncSince(null, now)).toBe("2026-08-20");
    expect(syncSince(new Date(2026, 10, 15, 12), now)).toBe("2026-11-08");
  });
  it("IBAN wird maskiert", () => {
    expect(maskIban("DE00 1234 5678 9012 3456 78")).toBe("DE00 •••• 5678");
  });
});

describe("finAPI-Client (gegen nachgebaute Antworten)", () => {
  function setup() {
    const saved: Record<string, { externalUserId: string; secret: string }> = {};
    const store: IdentityStore = {
      get: async (u) => saved[u] ?? null,
      save: async (u, externalUserId, secret) => {
        saved[u] = { externalUserId, secret };
      },
    };
    const calls: { url: string; init?: RequestInit }[] = [];
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/oauth/token")) return json({ access_token: String(init?.body).includes("grant_type=password") ? "USER" : "CLIENT", expires_in: 3599 });
      if (url.endsWith("/api/v2/users")) return json({ id: "vkUSER" }, 201);
      if (url.endsWith("/api/webForms/bankConnectionImport")) return json({ id: "wf1", url: "https://webform-sandbox.finapi.io/wf/wf1", status: "NOT_YET_OPENED" }, 201);
      if (url.endsWith("/api/webForms/wf1")) return json({ id: "wf1", status: "COMPLETED", payload: { bankConnectionId: 42 } });
      if (url.endsWith("/api/v2/bankConnections/42")) return json({ id: 42, updateStatus: "READY", bank: { name: "finAPI Test Bank" } });
      if (url.includes("/api/v2/accounts")) return json({ accounts: [{ id: 7, accountName: "Girokonto", iban: "DE11520513735120710131", balance: 1234.56, accountCurrency: "EUR", accountType: "CHECKING" }] });
      if (url.includes("/api/v2/transactions")) return json({ transactions: [{ id: 99, accountId: 7, amount: -12.5, bankBookingDate: "2026-11-17", purpose: "Kartenzahlung", counterpartName: "REWE" }], paging: { page: 1, pageCount: 1 } });
      return json({ errors: [{ message: "unbekannt" }] }, 404);
    });
    const provider = createFinapiProvider({
      clientId: "cid",
      clientSecret: "csecret",
      env: "sandbox",
      fetch: fetchMock as unknown as typeof fetch,
      store,
      newUserId: () => "vkUSER",
      newPassword: () => "PW",
    });
    return { provider, calls, saved };
  }

  it("legt beim ersten Mal einen finAPI-User an und startet das Web-Formular", async () => {
    const { provider, calls, saved } = setup();
    const ctx = { userId: "u1", connectionId: "c1" };
    const res = await provider.startImport(ctx, { returnUrl: "http://localhost:3000/bankkonten/zurueck?c=c1" });
    expect(saved.u1).toEqual({ externalUserId: "vkUSER", secret: "PW" });
    expect(calls[0].url).toBe("https://sandbox.finapi.io/api/v2/oauth/token");
    expect(calls[0].init?.headers).toMatchObject({ "Content-Type": "application/x-www-form-urlencoded" });
    expect(String(calls[0].init?.body)).toContain("grant_type=client_credentials");
    const form = calls.find((c) => c.url.endsWith("bankConnectionImport"))!;
    expect(form.init?.headers).toMatchObject({ Authorization: "Bearer USER" });
    const body = JSON.parse(String(form.init?.body));
    expect(body).toMatchObject({ accountTypes: ["CHECKING", "SAVINGS"], allowTestBank: true });
    expect(body.redirectUrl).toBeUndefined(); // http://localhost ist kein HTTPS
    expect(res.pendingFormId).toBe("wf1");
    expect(new URL(res.redirectUrl).searchParams.get("redirectUrl")).toBe("http://localhost:3000/bankkonten/zurueck?c=c1");
  });

  it("liest Ergebnis, Konten und Umsätze", async () => {
    const { provider } = setup();
    const ctx = { userId: "u1", connectionId: "c1" };
    expect(await provider.checkImport(ctx, "wf1")).toEqual({ status: "completed", externalConnectionId: "42", bankName: "finAPI Test Bank" });
    const [acc] = await provider.listAccounts(ctx, "42");
    expect(acc).toMatchObject({ externalId: "7", name: "Girokonto", balanceCents: 123456, type: "CHECKING" });
    const [tx] = await provider.listTransactions(ctx, ["7"], "2026-08-20");
    expect(tx).toEqual({ externalId: "99", externalAccountId: "7", date: "2026-11-17", amountCents: -1250, payee: "REWE", purpose: "Kartenzahlung" });
  });

  it("Mapping verträgt fehlende Felder", () => {
    expect(mapFinapiAccount({ id: 1 })).toMatchObject({ name: "Konto", balanceCents: null, currency: "EUR" });
    expect(mapFinapiTransaction({ id: 1, accountId: 2, amount: 0.1 + 0.2, valueDate: "2026-11-01T00:00:00" })).toMatchObject({ amountCents: 30, date: "2026-11-01", payee: "" });
  });
});
