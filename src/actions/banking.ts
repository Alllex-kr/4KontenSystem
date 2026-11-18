"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireFeature } from "@/lib/access";
import { activeProviderInfo, appUrl, getProvider, maskIban, type ProviderId } from "@/lib/banking";
import { planSync, syncSince } from "@/lib/banking/sync";
import { runAiCategorization } from "@/lib/ai/usage";
import { payeeKey } from "@/lib/csvImport";
import { getT } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";

type Result = { error?: string; redirectUrl?: string; message?: string; status?: string };

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return appUrl();
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

async function ownConnection(userId: string, id: string) {
  const c = await prisma.bankConnection.findFirst({ where: { id, userId }, include: { accounts: true } });
  if (!c) throw new Error(msg("Verbindung nicht gefunden."));
  return c;
}

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.length > 300 ? `${msg.slice(0, 300)}…` : msg;
}

/** Schritt 1: Verbindung anlegen und zum Web-Formular des Anbieters weiterleiten. */
export async function startBankConnection(): Promise<Result> {
  const t = await getT();
  const user = await requireFeature("bank.connect");
  const info = activeProviderInfo();
  if (info.problem) return { error: info.problem };
  // Abgebrochene Versuche aufräumen
  await prisma.bankConnection.deleteMany({ where: { userId: user.id, status: "PENDING", createdAt: { lt: new Date(Date.now() - 60 * 60_000) } } });
  const conn = await prisma.bankConnection.create({ data: { userId: user.id, provider: info.id } });
  try {
    const provider = getProvider(info.id);
    const returnUrl = `${await origin()}/bankkonten/zurueck?c=${conn.id}`;
    const { redirectUrl, pendingFormId } = await provider.startImport({ userId: user.id, connectionId: conn.id }, { returnUrl });
    await prisma.bankConnection.update({ where: { id: conn.id }, data: { pendingFormId } });
    return { redirectUrl };
  } catch (e) {
    await prisma.bankConnection.delete({ where: { id: conn.id } });
    return { error: t("Verbindung konnte nicht gestartet werden: {v0}", { v0: friendly(e) }) };
  }
}

/** Demo-Bank: Freigabe erteilen oder abbrechen. */
export async function answerDemoBank(connectionId: string, approve: boolean): Promise<Result> {
  const t = await getT();
  const user = await requireFeature("bank.connect");
  const c = await ownConnection(user.id, connectionId);
  if (c.provider !== "demo") return { error: t("Nur für die Demo-Bank.") };
  await prisma.bankConnection.update({ where: { id: c.id }, data: { pendingFormId: `${approve ? "done" : "aborted"}:${c.id}` } });
  return {};
}

/** Schritt 2 (nach Rücksprung): Status prüfen, Konten übernehmen. Wird von der Rücksprung-Seite wiederholt aufgerufen. */
export async function finalizeBankConnection(connectionId: string): Promise<Result> {
  const t = await getT();
  const user = await requireFeature("bank.connect");
  const c = await ownConnection(user.id, connectionId);
  if (c.status === "ACTIVE") return { status: "completed" };
  if (!c.pendingFormId) return { status: "failed", error: t("Diese Verbindung wurde nicht richtig gestartet.") };
  const ctx = { userId: user.id, connectionId: c.id };
  try {
    const provider = getProvider(c.provider as ProviderId);
    const check = await provider.checkImport(ctx, c.pendingFormId);
    if (check.status === "pending") return { status: "pending", message: check.message };
    if (check.status === "failed") {
      await prisma.bankConnection.update({ where: { id: c.id }, data: { status: "ERROR", lastError: check.message } });
      return { status: "failed", error: check.message };
    }
    const accounts = await provider.listAccounts(ctx, check.externalConnectionId);
    // Vorschlag: erstes Girokonto → Fixkostenkonto (wenn noch frei)
    const fix = await prisma.account.findFirst({ where: { userId: user.id, kind: "FIXKOSTEN" }, include: { bankLinks: true } });
    let fixFree = Boolean(fix && fix.bankLinks.length === 0);
    await prisma.$transaction([
      prisma.bankConnection.update({
        where: { id: c.id },
        data: { status: "ACTIVE", externalId: check.externalConnectionId, bankName: check.bankName, pendingFormId: null, lastError: null },
      }),
      ...accounts.map((a) => {
        const suggestFix = fixFree && (a.type === "CHECKING" || a.type === "Checking");
        if (suggestFix) fixFree = false;
        return prisma.bankAccountLink.upsert({
          where: { connectionId_externalId: { connectionId: c.id, externalId: a.externalId } },
          update: { name: a.name, ibanMasked: maskIban(a.iban), balanceCents: a.balanceCents, currency: a.currency, accountType: a.type },
          create: {
            connectionId: c.id,
            externalId: a.externalId,
            name: a.name,
            ibanMasked: maskIban(a.iban),
            balanceCents: a.balanceCents,
            currency: a.currency,
            accountType: a.type,
            accountId: suggestFix ? fix!.id : null,
          },
        });
      }),
    ]);
    revalidatePath("/bankkonten");
    return { status: "completed" };
  } catch (e) {
    return { status: "pending", error: t(friendly(e)) };
  }
}

const linkSchema = z.object({ linkId: z.string(), accountId: z.string().nullable(), syncBalance: z.boolean() });

/** Bankkonto einem FinanzKlee-Konto zuordnen. Pro FinanzKlee-Konto ist nur ein Bankkonto erlaubt. */
export async function updateBankLink(input: z.input<typeof linkSchema>): Promise<Result> {
  const t = await getT();
  const user = await requireFeature("bank.connect");
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { error: t("Ungültige Angaben.") };
  const { linkId, accountId, syncBalance } = parsed.data;
  const link = await prisma.bankAccountLink.findFirst({ where: { id: linkId, connection: { userId: user.id } } });
  if (!link) return { error: t("Konto nicht gefunden.") };
  if (accountId) {
    const acc = await prisma.account.findFirst({ where: { id: accountId, userId: user.id } });
    if (!acc) return { error: t("FinanzKlee-Konto nicht gefunden.") };
  }
  await prisma.$transaction([
    ...(accountId
      ? [prisma.bankAccountLink.updateMany({ where: { accountId, id: { not: linkId }, connection: { userId: user.id } }, data: { accountId: null } })]
      : []),
    prisma.bankAccountLink.update({ where: { id: linkId }, data: { accountId, syncBalance } }),
  ]);
  revalidatePath("/bankkonten");
  return { message: "Gespeichert." };
}

/**
 * Synchronisieren: Bank um neue Daten bitten (ggf. erneute Freigabe nötig),
 * dann Kontostände und neue Umsätze übernehmen.
 */
export async function syncBankConnection(connectionId: string): Promise<Result & { imported?: number }> {
  const t = await getT();
  const user = await requireFeature("bank.connect");
  const c = await ownConnection(user.id, connectionId);
  if (!c.externalId) return { error: t("Die Verbindung ist noch nicht fertig eingerichtet.") };
  const ctx = { userId: user.id, connectionId: c.id };
  const returnUrl = `${await origin()}/bankkonten/zurueck?c=${c.id}&sync=1`;
  try {
    const provider = getProvider(c.provider as ProviderId);

    // 1. Bank aktualisieren lassen (bis ca. 25 Sekunden warten)
    const taskId = c.pendingTaskId ?? (await provider.startUpdate(ctx, c.externalId, { returnUrl })).taskId;
    let state = await provider.checkUpdate(ctx, taskId, { returnUrl });
    for (let i = 0; i < 12 && state.status === "pending"; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      state = await provider.checkUpdate(ctx, taskId, { returnUrl });
    }
    if (state.status === "webform") {
      await prisma.bankConnection.update({ where: { id: c.id }, data: { status: "NEEDS_REAUTH", pendingTaskId: taskId } });
      return { redirectUrl: state.redirectUrl, message: t("Deine Bank möchte die Freigabe erneut bestätigen.") };
    }
    if (state.status === "failed") {
      await prisma.bankConnection.update({ where: { id: c.id }, data: { status: "ERROR", lastError: state.message, pendingTaskId: null } });
      return { error: t(state.message) };
    }
    // Bei "pending" nach Ablauf trotzdem weitermachen: es werden die bis jetzt vorhandenen Daten übernommen.

    // 2. Konten und Salden
    const accounts = await provider.listAccounts(ctx, c.externalId);
    const byExt = new Map(accounts.map((a) => [a.externalId, a]));
    const mapped = c.accounts.filter((l) => l.accountId);
    const accountMap = new Map(mapped.map((l) => [l.externalId, l.accountId!]));

    // 3. Umsätze
    // Ältester Sync-Zeitpunkt; ein neu zugeordnetes Konto (noch nie synchronisiert) holt 90 Tage
    const lastSyncs = mapped.map((l) => l.lastSyncAt);
    const oldest = lastSyncs.length === 0 || lastSyncs.some((d) => !d) ? null : lastSyncs.reduce((a, b) => (a! < b! ? a : b));
    const since = syncSince(oldest);
    const txs = await provider.listTransactions(ctx, mapped.map((l) => l.externalId), since);
    const [existing, rules] = await Promise.all([
      prisma.transaction.findMany({ where: { userId: user.id, accountId: { in: [...accountMap.values()] }, importHash: { not: null }, date: { gte: new Date(`${since}T00:00:00`) } }, select: { importHash: true } }),
      prisma.importRule.findMany({ where: { userId: user.id }, select: { pattern: true, category: true } }),
    ]);
    const plan = planSync(c.provider, txs, accountMap, new Set(existing.map((e) => e.importHash!)), rules);

    // Optional: Umsätze ohne passende Regel von Claude einordnen lassen (nur mit Opt-in)
    const unknown = plan.filter((p) => p.source === "fallback");
    const ai = await runAiCategorization(
      user.id,
      unknown.map((p) => ({ id: p.importHash, payee: p.payee, purpose: p.purpose, amountCents: p.amountCents })),
    );
    const aiRules = new Map<string, string>();
    for (const p of unknown) {
      const cat = ai.categories.get(p.importHash);
      if (!cat) continue;
      p.category = cat;
      const key = payeeKey(p);
      if (key.length >= 2) aiRules.set(key, cat);
    }
    const now = new Date();

    await prisma.$transaction([
      prisma.transaction.createMany({
        data: plan.map((p) => ({ userId: user.id, accountId: p.accountId, amountCents: p.amountCents, date: new Date(`${p.date}T12:00:00`), description: p.description, category: p.category, importHash: p.importHash })),
      }),
      ...c.accounts.map((l) => {
        const a = byExt.get(l.externalId);
        return prisma.bankAccountLink.update({
          where: { id: l.id },
          data: { balanceCents: a?.balanceCents ?? l.balanceCents, name: a?.name ?? l.name, ...(l.accountId ? { lastSyncAt: now } : {}) },
        });
      }),
      ...mapped
        .filter((l) => l.syncBalance && byExt.get(l.externalId)?.balanceCents != null)
        .map((l) => prisma.account.update({ where: { id: l.accountId! }, data: { balanceCents: byExt.get(l.externalId)!.balanceCents!, balanceUpdatedAt: now } })),
      prisma.bankConnection.update({ where: { id: c.id }, data: { status: "ACTIVE", lastSyncAt: now, lastError: null, pendingTaskId: null } }),
      // Was Claude entschieden hat, als Regel merken (spart beim nächsten Mal eine KI-Anfrage)
      ...[...aiRules.entries()].map(([pattern, category]) =>
        prisma.importRule.upsert({
          where: { userId_pattern: { userId: user.id, pattern } },
          update: {},
          create: { userId: user.id, pattern, category, source: "ai" },
        }),
      ),
    ]);
    revalidatePath("/", "layout");
    return {
      imported: plan.length,
      message:
        mapped.length === 0
          ? t("Ordne zuerst mindestens ein Bankkonto einem FinanzKlee-Konto zu.")
          : t("{n} neue Umsätze übernommen.", { n: plan.length }) +
            (ai.categories.size ? " ✨ " + t("{n} davon hat Claude eingeordnet.", { n: ai.categories.size }) : "") +
            (ai.error ? ` (${t("KI")}: ${t(ai.error)})` : ""),
    };
  } catch (e) {
    await prisma.bankConnection.update({ where: { id: c.id }, data: { lastError: friendly(e) } });
    return { error: t(friendly(e)) };
  }
}

/** Verbindung trennen. Bereits übernommene Umsätze bleiben erhalten. */
export async function disconnectBank(connectionId: string): Promise<Result> {
  const t = await getT();
  const user = await requireFeature("bank.connect");
  const c = await ownConnection(user.id, connectionId);
  let warning: string | undefined;
  if (c.externalId) {
    try {
      await getProvider(c.provider as ProviderId).deleteConnection({ userId: user.id, connectionId: c.id }, c.externalId);
    } catch (e) {
      warning = t("Beim Anbieter konnte die Verbindung nicht gelöscht werden ({reason}). Lokal ist sie entfernt.", { reason: t(friendly(e)) });
    }
  }
  await prisma.bankConnection.delete({ where: { id: c.id } });
  revalidatePath("/bankkonten");
  return { message: warning ?? t("Verbindung getrennt.") };
}
