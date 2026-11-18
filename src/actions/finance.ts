"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireFeature } from "@/lib/access";
import { ACCOUNT_KINDS, CATEGORIES } from "@/lib/constants";
import { ACCENTS, APPEARANCE_COOKIE, FONT_SCALES, MOTIONS, THEMES, normalizeAppearance } from "@/lib/appearance";
import { layoutSchema } from "@/lib/dashboard";
import { parseEuroToCents, intlLocale } from "@/lib/format";
import { ensureUserSetup } from "@/lib/data";
import type { ActionState } from "./types";
import { getT } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";

const euro = (message: string = msg("Bitte einen gültigen Betrag eingeben (z. B. 12,50).")) =>
  z.string().transform((v, ctx) => {
    const c = parseEuroToCents(v);
    if (c === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      return z.NEVER;
    }
    return c;
  });

function firstError(e: z.ZodError) {
  return e.issues[0]?.message ?? msg("Ungültige Eingabe.");
}

function refresh() {
  revalidatePath("/", "layout");
}

async function ownAccount(userId: string, accountId: string) {
  const acc = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!acc) throw new Error(msg("Konto nicht gefunden."));
  return acc;
}

// ---------- Kontostände ----------

export async function updateBalance(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getT();
  const user = await requireUser();
  const parsed = z.object({ accountId: z.string(), balance: euro() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t(firstError(parsed.error)) };
  await ownAccount(user.id, parsed.data.accountId);
  await prisma.account.update({
    where: { id: parsed.data.accountId },
    data: { balanceCents: parsed.data.balance, balanceUpdatedAt: new Date() },
  });
  refresh();
  return { success: t("Kontostand gespeichert.") };
}

export async function transfer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getT();
  const user = await requireUser();
  const parsed = z
    .object({ fromId: z.string(), toId: z.string(), amount: euro(), note: z.string().max(100).optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t(firstError(parsed.error)) };
  const { fromId, toId, amount, note } = parsed.data;
  if (fromId === toId) return { error: t("Bitte zwei verschiedene Konten wählen.") };
  if (amount <= 0) return { error: t("Der Betrag muss größer als 0 sein.") };
  const [from, to] = await Promise.all([ownAccount(user.id, fromId), ownAccount(user.id, toId)]);
  const group = randomUUID();
  const date = new Date();
  const description = note?.trim() || t("Umbuchung {from} → {to}", { from: from.name, to: to.name });
  await prisma.$transaction([
    prisma.transaction.create({ data: { userId: user.id, accountId: from.id, amountCents: -amount, date, description, category: "Umbuchung", transferGroup: group } }),
    prisma.transaction.create({ data: { userId: user.id, accountId: to.id, amountCents: amount, date, description, category: "Umbuchung", transferGroup: group } }),
    prisma.account.update({ where: { id: from.id }, data: { balanceCents: { decrement: amount } } }),
    prisma.account.update({ where: { id: to.id }, data: { balanceCents: { increment: amount } } }),
  ]);
  refresh();
  return { success: t("Umbuchung durchgeführt.") };
}

// ---------- Wiederkehrende Zahlungen ----------

const paymentSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, msg("Bitte eine Bezeichnung angeben.")).max(80),
  amount: euro(),
  direction: z.enum(["IN", "OUT"]),
  accountId: z.string().min(1),
  dayOfMonth: z.coerce.number().int().min(1, msg("Tag 1–31")).max(31, msg("Tag 1–31")),
  intervalMonths: z.coerce.number().int().min(1).max(24),
  startMonth: z.coerce.number().int().min(1).max(12),
  category: z.enum(CATEGORIES),
});

export async function savePayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getT();
  const user = await requireUser();
  const raw = Object.fromEntries(formData);
  const parsed = paymentSchema.safeParse({ ...raw, id: raw.id || undefined });
  if (!parsed.success) return { error: t(firstError(parsed.error)) };
  const { id, amount, ...rest } = parsed.data;
  if (amount <= 0) return { error: t("Der Betrag muss größer als 0 sein.") };
  await ownAccount(user.id, rest.accountId);
  const data = { ...rest, amountCents: amount, userId: user.id };
  if (id) {
    const res = await prisma.recurringPayment.updateMany({ where: { id, userId: user.id }, data });
    if (res.count === 0) return { error: t("Zahlung nicht gefunden.") };
  } else {
    await prisma.recurringPayment.create({ data });
  }
  refresh();
  return { success: id ? t("Zahlung aktualisiert.") : t("Zahlung hinzugefügt.") };
}

export async function togglePayment(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const p = await prisma.recurringPayment.findFirst({ where: { id, userId: user.id } });
  if (p) await prisma.recurringPayment.update({ where: { id }, data: { active: !p.active } });
  refresh();
}

export async function deletePayment(formData: FormData) {
  const user = await requireUser();
  await prisma.recurringPayment.deleteMany({ where: { id: String(formData.get("id")), userId: user.id } });
  refresh();
}

// Löschen mit "Rückgängig" (ersetzt den "Änderung abbrechen"-Ablauf der Excel)
const paymentSnap = z.object({
  id: z.string(),
  accountId: z.string(),
  name: z.string().max(80),
  amountCents: z.number().int(),
  direction: z.enum(["IN", "OUT"]),
  dayOfMonth: z.number().int(),
  intervalMonths: z.number().int(),
  startMonth: z.number().int(),
  category: z.enum(CATEGORIES),
  active: z.boolean(),
});
export type PaymentSnapshot = z.infer<typeof paymentSnap>;

export async function deletePaymentUndoable(id: string): Promise<PaymentSnapshot | null> {
  const user = await requireUser();
  const p = await prisma.recurringPayment.findFirst({ where: { id, userId: user.id } });
  if (!p) return null;
  await prisma.recurringPayment.delete({ where: { id } });
  refresh();
  const { userId: _u, ...rest } = p;
  return rest as PaymentSnapshot;
}

export async function restorePayment(snapshot: PaymentSnapshot): Promise<ActionState> {
  const t = await getT();
  const user = await requireUser();
  const s = paymentSnap.safeParse(snapshot);
  if (!s.success) return { error: t("Wiederherstellen nicht möglich.") };
  await ownAccount(user.id, s.data.accountId);
  await prisma.recurringPayment.create({ data: { ...s.data, userId: user.id } });
  refresh();
  return { success: "Wiederhergestellt." };
}

// ---------- Buchungen ----------

const txSchema = z.object({
  accountId: z.string().min(1),
  amount: euro(),
  direction: z.enum(["IN", "OUT"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg("Bitte ein Datum wählen.")),
  description: z.string().trim().max(100).optional(),
  category: z.enum(CATEGORIES),
});

export async function addTransaction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getT();
  const user = await requireUser();
  const parsed = txSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t(firstError(parsed.error)) };
  const { accountId, amount, direction, date, category } = parsed.data;
  const description = parsed.data.description || category;
  if (amount <= 0) return { error: t("Der Betrag muss größer als 0 sein.") };
  const account = await ownAccount(user.id, accountId);
  const signed = direction === "IN" ? amount : -amount;
  // Excel-Makro "KontostandEingabeAbschließen": Liegt die Buchung vor dem letzten Abgleich mit der Bank,
  // ist sie im Kontostand schon enthalten → Kontostand nicht noch einmal ändern.
  const abgleich = account.balanceUpdatedAt;
  const abgleichDay = abgleich
    ? `${abgleich.getFullYear()}-${String(abgleich.getMonth() + 1).padStart(2, "0")}-${String(abgleich.getDate()).padStart(2, "0")}`
    : null;
  const affectsBalance = !abgleichDay || date >= abgleichDay;
  await prisma.$transaction([
    prisma.transaction.create({ data: { userId: user.id, accountId, amountCents: signed, date: new Date(`${date}T12:00:00`), description, category, affectsBalance } }),
    ...(affectsBalance ? [prisma.account.update({ where: { id: accountId }, data: { balanceCents: { increment: signed } } })] : []),
  ]);
  refresh();
  return affectsBalance
    ? { success: t("Buchung gespeichert.") }
    : { success: t("Gebucht. Der Kontostand bleibt unverändert, weil die Buchung vor deinem letzten Abgleich am {v0} liegt und dort schon enthalten ist.", { v0: abgleich!.toLocaleDateString(intlLocale()) }) };
}

export async function deleteTransaction(formData: FormData) {
  const user = await requireUser();
  const tx = await prisma.transaction.findFirst({ where: { id: String(formData.get("id")), userId: user.id } });
  if (!tx) return;
  // Bei Umbuchungen beide Seiten zurückdrehen.
  const all = tx.transferGroup
    ? await prisma.transaction.findMany({ where: { transferGroup: tx.transferGroup, userId: user.id } })
    : [tx];
  await prisma.$transaction([
    ...all.filter((t) => t.affectsBalance).map((t) => prisma.account.update({ where: { id: t.accountId }, data: { balanceCents: { decrement: t.amountCents } } })),
    prisma.transaction.deleteMany({ where: { id: { in: all.map((t) => t.id) } } }),
  ]);
  refresh();
}

const txSnap = z.object({
  id: z.string(),
  accountId: z.string(),
  amountCents: z.number().int(),
  date: z.string(),
  description: z.string().max(100),
  category: z.string().max(40),
  transferGroup: z.string().nullable(),
  affectsBalance: z.boolean(),
  importHash: z.string().nullable(),
});
export type TransactionSnapshot = z.infer<typeof txSnap>;

/** Löschen mit Rückgängig: liefert die gelöschten Buchungen (bei Umbuchungen beide Seiten). */
export async function deleteTransactionUndoable(id: string): Promise<TransactionSnapshot[] | null> {
  const user = await requireUser();
  const tx = await prisma.transaction.findFirst({ where: { id, userId: user.id } });
  if (!tx) return null;
  const all = tx.transferGroup ? await prisma.transaction.findMany({ where: { transferGroup: tx.transferGroup, userId: user.id } }) : [tx];
  await prisma.$transaction([
    ...all.filter((t) => t.affectsBalance).map((t) => prisma.account.update({ where: { id: t.accountId }, data: { balanceCents: { decrement: t.amountCents } } })),
    prisma.transaction.deleteMany({ where: { id: { in: all.map((t) => t.id) } } }),
  ]);
  refresh();
  return all.map((t) => ({
    id: t.id,
    accountId: t.accountId,
    amountCents: t.amountCents,
    date: t.date.toISOString(),
    description: t.description,
    category: t.category,
    transferGroup: t.transferGroup,
    affectsBalance: t.affectsBalance,
    importHash: t.importHash,
  }));
}

export async function restoreTransactions(snapshot: TransactionSnapshot[]): Promise<ActionState> {
  const t = await getT();
  const user = await requireUser();
  const s = z.array(txSnap).max(2).safeParse(snapshot);
  if (!s.success || !s.data.length) return { error: t("Wiederherstellen nicht möglich.") };
  for (const t of s.data) await ownAccount(user.id, t.accountId);
  await prisma.$transaction([
    ...s.data.map((t) => prisma.transaction.create({ data: { ...t, date: new Date(t.date), userId: user.id } })),
    ...s.data.filter((t) => t.affectsBalance).map((t) => prisma.account.update({ where: { id: t.accountId }, data: { balanceCents: { increment: t.amountCents } } })),
  ]);
  refresh();
  return { success: "Wiederhergestellt." };
}

// ---------- Sparziele ----------

const goalSchema = z.object({
  name: z.string().trim().min(1, msg("Bitte einen Namen angeben.")).max(60),
  target: euro(),
  saved: euro().optional().or(z.literal("").transform(() => 0)),
  deadline: z.string().optional(),
});

export async function addGoal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getT();
  const user = await requireFeature("goals.use");
  const parsed = goalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t(firstError(parsed.error)) };
  const { name, target, saved, deadline } = parsed.data;
  if (target <= 0) return { error: t("Das Ziel muss größer als 0 sein.") };
  await prisma.savingsGoal.create({
    data: { userId: user.id, name, targetCents: target, savedCents: saved ?? 0, deadline: deadline ? new Date(`${deadline}T12:00:00`) : null },
  });
  refresh();
  return { success: t("Sparziel angelegt.") };
}

export async function depositGoal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getT();
  const user = await requireFeature("goals.use");
  const parsed = z.object({ id: z.string(), amount: euro() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t(firstError(parsed.error)) };
  const res = await prisma.savingsGoal.updateMany({
    where: { id: parsed.data.id, userId: user.id },
    data: { savedCents: { increment: parsed.data.amount } },
  });
  if (res.count === 0) return { error: t("Sparziel nicht gefunden.") };
  refresh();
  return { success: "Gespeichert." };
}

export async function deleteGoal(formData: FormData) {
  const user = await requireFeature("goals.use");
  await prisma.savingsGoal.deleteMany({ where: { id: String(formData.get("id")), userId: user.id } });
  refresh();
}

const goalSnap = z.object({
  id: z.string(),
  name: z.string().max(60),
  targetCents: z.number().int(),
  savedCents: z.number().int(),
  deadline: z.string().nullable(),
  createdAt: z.string(),
});
export type GoalSnapshot = z.infer<typeof goalSnap>;

export async function deleteGoalUndoable(id: string): Promise<GoalSnapshot | null> {
  const user = await requireFeature("goals.use");
  const g = await prisma.savingsGoal.findFirst({ where: { id, userId: user.id } });
  if (!g) return null;
  await prisma.savingsGoal.delete({ where: { id } });
  refresh();
  return { id: g.id, name: g.name, targetCents: g.targetCents, savedCents: g.savedCents, deadline: g.deadline?.toISOString() ?? null, createdAt: g.createdAt.toISOString() };
}

export async function restoreGoal(snapshot: GoalSnapshot): Promise<ActionState> {
  const t = await getT();
  const user = await requireFeature("goals.use");
  const s = goalSnap.safeParse(snapshot);
  if (!s.success) return { error: t("Wiederherstellen nicht möglich.") };
  await prisma.savingsGoal.create({
    data: { ...s.data, userId: user.id, deadline: s.data.deadline ? new Date(s.data.deadline) : null, createdAt: new Date(s.data.createdAt) },
  });
  refresh();
  return { success: "Wiederhergestellt." };
}

// ---------- Einstellungen ----------

export async function saveSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getT();
  const user = await requireUser();
  const parsed = z
    .object({
      minBuffer: euro(),
      emergencyMonths: z.coerce.number().int().min(1, msg("1–12 Monate")).max(12, msg("1–12 Monate")),
      savingsRatePct: z.coerce.number().int().min(0).max(80, msg("Sparquote max. 80 %")),
      emergencyRatePct: z.coerce.number().int().min(0).max(80, msg("Notgroschen-Quote max. 80 %")),
      transferDay: z.coerce.number().int().min(1).max(28, msg("Tag 1–28")),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t(firstError(parsed.error)) };
  const { minBuffer, ...rest } = parsed.data;
  await prisma.settings.update({ where: { userId: user.id }, data: { ...rest, minBufferCents: minBuffer } });
  refresh();
  return { success: t("Einstellungen gespeichert.") };
}

// ---------- Beispieldaten ----------

export async function loadDemoData() {
  const user = await requireUser();
  await ensureUserSetup(user.id);
  const accounts = await prisma.account.findMany({ where: { userId: user.id } });
  const id = (k: (typeof ACCOUNT_KINDS)[number]) => accounts.find((a) => a.kind === k)!.id;
  const now = new Date();
  const m = now.getMonth() + 1;

  const payments = [
    { name: "Nebenjob (Werkstudent)", amountCents: 95000, direction: "IN", dayOfMonth: 1, intervalMonths: 1, startMonth: 1, category: "Einkommen" },
    { name: "BAföG", amountCents: 45000, direction: "IN", dayOfMonth: 1, intervalMonths: 1, startMonth: 1, category: "Einkommen" },
    { name: "WG-Zimmer Miete", amountCents: 42000, direction: "OUT", dayOfMonth: 3, intervalMonths: 1, startMonth: 1, category: "Wohnen" },
    { name: "Lebensmittel-Budget", amountCents: 22000, direction: "OUT", dayOfMonth: 1, intervalMonths: 1, startMonth: 1, category: "Lebensmittel" },
    { name: "Deutschlandticket", amountCents: 5800, direction: "OUT", dayOfMonth: 1, intervalMonths: 1, startMonth: 1, category: "Mobilität" },
    { name: "Handyvertrag", amountCents: 1499, direction: "OUT", dayOfMonth: 15, intervalMonths: 1, startMonth: 1, category: "Handy & Internet" },
    { name: "Streaming-Abo", amountCents: 999, direction: "OUT", dayOfMonth: 20, intervalMonths: 1, startMonth: 1, category: "Abos" },
    { name: "Semesterbeitrag", amountCents: 32000, direction: "OUT", dayOfMonth: 15, intervalMonths: 6, startMonth: 2, category: "Studium" },
    { name: "Haftpflichtversicherung", amountCents: 5500, direction: "OUT", dayOfMonth: 1, intervalMonths: 12, startMonth: 10, category: "Versicherung" },
    { name: "Rundfunkbeitrag", amountCents: 5508, direction: "OUT", dayOfMonth: 15, intervalMonths: 3, startMonth: 1, category: "Wohnen" },
    { name: "ETF-Sparplan", amountCents: 5000, direction: "OUT", dayOfMonth: 5, intervalMonths: 1, startMonth: 1, category: "Sparen", account: "SPAREN" as const },
  ];
  const balances: Record<string, number> = { FIXKOSTEN: 68000, SPAREN: 230000, NOTGROSCHEN: 45000, FREIZEIT: 45000 };

  const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset, 12);
  const txs = [
    { kind: "FREIZEIT", amountCents: -2450, offset: 1, description: "Pizza mit Freunden", category: "Essen gehen" },
    { kind: "FREIZEIT", amountCents: -1200, offset: 3, description: "Kino", category: "Freizeit" },
    { kind: "FREIZEIT", amountCents: -3999, offset: 6, description: "Neue Sneaker (Sale)", category: "Shopping" },
    { kind: "FREIZEIT", amountCents: -850, offset: 9, description: "Mensa-Party", category: "Freizeit" },
    { kind: "FREIZEIT", amountCents: -1590, offset: 12, description: "Döner & Getränke", category: "Essen gehen" },
    { kind: "FIXKOSTEN", amountCents: -4320, offset: 4, description: "Wocheneinkauf", category: "Lebensmittel" },
    { kind: "FIXKOSTEN", amountCents: -5110, offset: 11, description: "Wocheneinkauf", category: "Lebensmittel" },
    { kind: "NOTGROSCHEN", amountCents: -8900, offset: 20, description: "Fahrradreparatur", category: "Mobilität" },
    { kind: "FIXKOSTEN", amountCents: -4780, offset: 35, description: "Wocheneinkauf", category: "Lebensmittel" },
    { kind: "FREIZEIT", amountCents: -6500, offset: 40, description: "Konzertticket", category: "Freizeit" },
    { kind: "FREIZEIT", amountCents: -2200, offset: 47, description: "Sushi", category: "Essen gehen" },
    { kind: "FIXKOSTEN", amountCents: 3000, offset: 50, description: "Pfand & Rückerstattung", category: "Sonstiges" },
    { kind: "FREIZEIT", amountCents: -4500, offset: 70, description: "Geburtstagsgeschenk", category: "Shopping" },
    { kind: "FREIZEIT", amountCents: -3100, offset: 95, description: "Bowling", category: "Freizeit" },
    { kind: "FIXKOSTEN", amountCents: -2500, offset: 100, description: "Fachbuch", category: "Studium" },
  ] as const;

  await prisma.$transaction([
    prisma.recurringPayment.deleteMany({ where: { userId: user.id } }),
    prisma.transaction.deleteMany({ where: { userId: user.id } }),
    prisma.savingsGoal.deleteMany({ where: { userId: user.id } }),
    prisma.reserveItem.deleteMany({ where: { userId: user.id } }),
    prisma.recurringPayment.createMany({
      data: payments.map(({ account, ...p }) => ({
        ...p,
        // Unregelmäßige Zahlungen so legen, dass eine bald fällig ist
        startMonth: p.intervalMonths > 1 ? ((p.startMonth + m) % 12) + 1 : p.startMonth,
        userId: user.id,
        accountId: id(account ?? "FIXKOSTEN"),
      })),
    }),
    ...ACCOUNT_KINDS.map((k) => prisma.account.update({ where: { id: id(k) }, data: { balanceCents: balances[k], balanceUpdatedAt: now } })),
    prisma.transaction.createMany({
      data: txs.map((t) => ({ userId: user.id, accountId: id(t.kind), amountCents: t.amountCents, date: day(t.offset), description: t.description, category: t.category })),
    }),
    prisma.savingsGoal.createMany({
      data: [
        { userId: user.id, name: "Auslandssemester", targetCents: 300000, savedCents: 85000, deadline: new Date(now.getFullYear() + 1, 8, 1) },
        { userId: user.id, name: "Neuer Laptop", targetCents: 110000, savedCents: 62000, deadline: new Date(now.getFullYear(), now.getMonth() + 5, 1) },
        { userId: user.id, name: "Führerschein", targetCents: 250000, savedCents: 30000, deadline: null },
      ],
    }),
    // Rücklagen wie im Excel-Blatt "Reserve": bekannte Wiederholung + unregelmäßig mit Dokumentation
    prisma.reserveItem.create({
      data: {
        userId: user.id, name: "Weihnachtsgeschenke", kind: "PLANNED", plannedAmountCents: 30000,
        purchases: { create: [
          { date: new Date(now.getFullYear() - 2, 11, 12, 12), amountCents: 28000 },
          { date: new Date(now.getFullYear() - 1, 11, 12, 12), amountCents: 31000 },
        ] },
      },
    }),
    prisma.reserveItem.create({
      data: {
        userId: user.id, name: "Handy-Ersatz", kind: "PLANNED", plannedIntervalMonths: 36, plannedAmountCents: 45000,
        purchases: { create: [{ date: new Date(now.getFullYear(), now.getMonth() - 20, 5, 12), amountCents: 42000 }] },
      },
    }),
    prisma.reserveItem.create({
      data: {
        userId: user.id, name: "Urlaub & Reisen", kind: "IRREGULAR", plannedIntervalMonths: 12, plannedAmountCents: 60000,
        purchases: { create: [
          { date: new Date(now.getFullYear(), now.getMonth() - 20, 10, 12), amountCents: 35000, note: "Wien" },
          { date: new Date(now.getFullYear(), now.getMonth() - 15, 2, 12), amountCents: 52000, note: "Festival" },
          { date: new Date(now.getFullYear(), now.getMonth() - 11, 28, 12), amountCents: 18000, note: "Silvester" },
          { date: new Date(now.getFullYear(), now.getMonth() - 4, 15, 12), amountCents: 46000, note: "Kroatien" },
        ] },
      },
    }),
    prisma.settings.update({
      where: { userId: user.id },
      data: { reserveMonthlyCents: 8000, reserveTolerancePct: 15, reserveAccountKind: "SPAREN", confirmedOrders: null, ordersValidFrom: null },
    }),
  ]);
  refresh();
}

// ---------- Darstellung & Anpassung ----------

/** Darstellung auf diesem Gerät merken, damit sie auch auf Start- und Anmeldeseite gilt. */
async function rememberAppearance(settings: Parameters<typeof normalizeAppearance>[0]) {
  const a = normalizeAppearance(settings);
  (await cookies()).set(APPEARANCE_COOKIE, encodeURIComponent(JSON.stringify({ theme: a.theme, accent: a.accent, fontScale: a.fontScale, motion: a.motion })), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
  });
}

const appearanceSchema = z.object({
  theme: z.enum(THEMES).optional(),
  accent: z.enum(Object.keys(ACCENTS) as [keyof typeof ACCENTS, ...(keyof typeof ACCENTS)[]]).optional(),
  fontScale: z.enum(FONT_SCALES).optional(),
  hideAmounts: z.boolean().optional(),
  motion: z.enum(MOTIONS).optional(),
});

/** Speichert einzelne Darstellungs-Optionen (wird live beim Anklicken aufgerufen). */
export async function saveAppearance(input: z.input<typeof appearanceSchema>): Promise<ActionState> {
  const t = await getT();
  const user = await requireUser();
  const parsed = appearanceSchema.safeParse(input);
  if (!parsed.success) return { error: t("Ungültige Einstellung.") };
  await ensureUserSetup(user.id);
  const saved = await prisma.settings.update({ where: { userId: user.id }, data: parsed.data });
  await rememberAppearance(saved);
  refresh();
  return { success: "Gespeichert." };
}

export async function saveDashboardLayout(layout: unknown): Promise<ActionState> {
  const t = await getT();
  const user = await requireFeature("customize.use");
  const parsed = layoutSchema.safeParse(layout);
  if (!parsed.success) return { error: t("Layout konnte nicht gespeichert werden.") };
  await ensureUserSetup(user.id);
  await prisma.settings.update({ where: { userId: user.id }, data: { dashboardLayout: JSON.stringify(parsed.data) } });
  revalidatePath("/dashboard");
  return { success: t("Dashboard gespeichert.") };
}

export async function updateAccountAppearance(input: { accountId: string; name?: string; color?: string | null }): Promise<ActionState> {
  const t = await getT();
  const user = await requireFeature("customize.use");
  const parsed = z
    .object({
      accountId: z.string(),
      name: z.string().trim().min(1, msg("Name darf nicht leer sein.")).max(40).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: t(firstError(parsed.error)) };
  await ownAccount(user.id, parsed.data.accountId);
  const { accountId, ...data } = parsed.data;
  await prisma.account.update({ where: { id: accountId }, data });
  refresh();
  return { success: t("Konto aktualisiert.") };
}
