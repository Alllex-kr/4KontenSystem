import { prisma } from "./db";
import { ACCOUNT_KINDS, ACCOUNT_META, type AccountKind } from "./constants";
import { allocate, summarize, type Balances, type PaymentLike, type SettingsLike } from "./finance";

/** Legt die vier Konten und Einstellungen an, falls sie fehlen. */
export async function ensureUserSetup(userId: string) {
  const existing = await prisma.account.findMany({ where: { userId }, select: { kind: true } });
  const missing = ACCOUNT_KINDS.filter((k) => !existing.some((e) => e.kind === k));
  if (missing.length) {
    await prisma.account.createMany({
      data: missing.map((kind) => ({ userId, kind, name: ACCOUNT_META[kind].label })),
    });
  }
  await prisma.settings.upsert({ where: { userId }, update: {}, create: { userId } });
}

/** Lädt alles, was für Übersicht und Berechnungen gebraucht wird. */
export async function loadOverview(userId: string) {
  await ensureUserSetup(userId);
  const [accounts, payments, settings] = await Promise.all([
    prisma.account.findMany({ where: { userId } }),
    prisma.recurringPayment.findMany({ where: { userId }, include: { account: { select: { kind: true } } }, orderBy: [{ direction: "asc" }, { dayOfMonth: "asc" }] }),
    prisma.settings.findUniqueOrThrow({ where: { userId } }),
  ]);
  const sortedAccounts = [...accounts]
    .sort((a, b) => ACCOUNT_KINDS.indexOf(a.kind as AccountKind) - ACCOUNT_KINDS.indexOf(b.kind as AccountKind))
    .map((a) => ({ ...a, color: a.color ?? ACCOUNT_META[a.kind as AccountKind].color }));
  const colors = Object.fromEntries(sortedAccounts.map((a) => [a.kind, a.color])) as Record<AccountKind, string>;
  const names = Object.fromEntries(sortedAccounts.map((a) => [a.kind, a.name])) as Record<AccountKind, string>;
  const balances = Object.fromEntries(ACCOUNT_KINDS.map((k) => [k, 0])) as Balances;
  for (const a of accounts) balances[a.kind as AccountKind] = a.balanceCents;

  const paymentLikes: PaymentLike[] = payments.map((p) => ({ ...p, accountKind: p.account.kind as AccountKind }));
  const settingsLike: SettingsLike = settings;
  const summary = summarize(paymentLikes);
  const allocation = allocate(summary, settingsLike, balances);
  return { accounts: sortedAccounts, colors, names, payments, paymentLikes, settings, balances, summary, allocation };
}

/** Konten für Navigation und Schnellbuchung. */
export async function loadAccountsLite(userId: string) {
  await ensureUserSetup(userId);
  const accounts = await prisma.account.findMany({ where: { userId }, select: { id: true, kind: true, name: true, color: true } });
  return accounts
    .sort((a, b) => ACCOUNT_KINDS.indexOf(a.kind as AccountKind) - ACCOUNT_KINDS.indexOf(b.kind as AccountKind))
    .map((a) => ({ ...a, color: a.color ?? ACCOUNT_META[a.kind as AccountKind].color }));
}
export type AccountLite = Awaited<ReturnType<typeof loadAccountsLite>>[number];
