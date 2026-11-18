"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireFeature } from "@/lib/access";
import { ACCOUNT_KINDS, type AccountKind } from "@/lib/constants";
import { parseEuroToCents } from "@/lib/format";
import { loadOverview } from "@/lib/data";
import { bookTransfer } from "@/lib/transfers";
import { ordersValidFrom, reserveSummary } from "@/lib/planning";
import type { ActionState } from "./types";

function refresh() {
  revalidatePath("/", "layout");
}

const optionalEuro = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v || !v.trim()) return null;
    const c = parseEuroToCents(v);
    if (c === null || c < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Bitte einen gültigen Betrag eingeben (z. B. 360,00)." });
      return z.NEVER;
    }
    return c;
  });
const optionalInt = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v || !v.trim()) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 240) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Intervall: ganze Monate zwischen 1 und 240." });
      return z.NEVER;
    }
    return n;
  });

// ---------------------------------------------------------------- Rücklagen-Posten

export async function saveReserveItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireFeature("reserves.use");
  const parsed = z
    .object({
      id: z.string().optional(),
      name: z.string().trim().min(1, "Bitte eine Bezeichnung angeben.").max(60),
      kind: z.enum(["PLANNED", "IRREGULAR"]),
      interval: optionalInt,
      amount: optionalEuro,
    })
    .safeParse({ ...Object.fromEntries(formData), id: formData.get("id") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { id, name, kind, interval, amount } = parsed.data;
  const data = { name, kind, plannedIntervalMonths: interval, plannedAmountCents: amount };
  if (id) {
    const res = await prisma.reserveItem.updateMany({ where: { id, userId: user.id }, data });
    if (!res.count) return { error: "Posten nicht gefunden." };
  } else {
    await prisma.reserveItem.create({ data: { ...data, userId: user.id } });
  }
  refresh();
  return { success: id ? "Posten gespeichert." : "Posten angelegt." };
}

export async function setUseEffective(itemId: string, value: boolean) {
  const user = await requireFeature("reserves.use");
  await prisma.reserveItem.updateMany({ where: { id: itemId, userId: user.id }, data: { useEffective: value } });
  refresh();
}

export async function addReservePurchase(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireFeature("reserves.use");
  const parsed = z
    .object({
      itemId: z.string(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte ein Datum wählen."),
      amount: z.string().transform((v, ctx) => {
        const c = parseEuroToCents(v);
        if (c === null || c <= 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Bitte einen gültigen Betrag eingeben." });
          return z.NEVER;
        }
        return c;
      }),
      note: z.string().trim().max(80).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const item = await prisma.reserveItem.findFirst({ where: { id: parsed.data.itemId, userId: user.id } });
  if (!item) return { error: "Posten nicht gefunden." };
  await prisma.reservePurchase.create({
    data: { itemId: item.id, date: new Date(`${parsed.data.date}T12:00:00`), amountCents: parsed.data.amount, note: parsed.data.note || null },
  });
  refresh();
  return { success: "Kauf dokumentiert." };
}

// Löschen mit "Rückgängig": Die Daten gehen an den Browser zurück und können wiederhergestellt werden.
const purchaseSnap = z.object({ id: z.string(), itemId: z.string(), date: z.string(), amountCents: z.number().int(), note: z.string().nullable() });
const itemSnap = z.object({
  id: z.string(),
  name: z.string().max(60),
  kind: z.enum(["PLANNED", "IRREGULAR"]),
  plannedIntervalMonths: z.number().int().nullable(),
  plannedAmountCents: z.number().int().nullable(),
  useEffective: z.boolean(),
  createdAt: z.string(),
  purchases: z.array(purchaseSnap).max(500),
});
export type ReserveItemSnapshot = z.infer<typeof itemSnap>;
export type ReservePurchaseSnapshot = z.infer<typeof purchaseSnap>;

export async function deleteReserveItem(id: string): Promise<ReserveItemSnapshot | null> {
  const user = await requireFeature("reserves.use");
  const item = await prisma.reserveItem.findFirst({ where: { id, userId: user.id }, include: { purchases: true } });
  if (!item) return null;
  await prisma.reserveItem.delete({ where: { id } });
  refresh();
  return {
    id: item.id,
    name: item.name,
    kind: item.kind as "PLANNED" | "IRREGULAR",
    plannedIntervalMonths: item.plannedIntervalMonths,
    plannedAmountCents: item.plannedAmountCents,
    useEffective: item.useEffective,
    createdAt: item.createdAt.toISOString(),
    purchases: item.purchases.map((p) => ({ id: p.id, itemId: p.itemId, date: p.date.toISOString(), amountCents: p.amountCents, note: p.note })),
  };
}

export async function restoreReserveItem(snapshot: ReserveItemSnapshot): Promise<ActionState> {
  const user = await requireFeature("reserves.use");
  const s = itemSnap.safeParse(snapshot);
  if (!s.success) return { error: "Wiederherstellen nicht möglich." };
  const { purchases, createdAt, ...rest } = s.data;
  await prisma.reserveItem.create({
    data: {
      ...rest,
      userId: user.id,
      createdAt: new Date(createdAt),
      purchases: { create: purchases.map((p) => ({ id: p.id, date: new Date(p.date), amountCents: p.amountCents, note: p.note })) },
    },
  });
  refresh();
  return { success: "Wiederhergestellt." };
}

export async function deleteReservePurchase(id: string): Promise<ReservePurchaseSnapshot | null> {
  const user = await requireFeature("reserves.use");
  const p = await prisma.reservePurchase.findFirst({ where: { id, item: { userId: user.id } } });
  if (!p) return null;
  await prisma.reservePurchase.delete({ where: { id } });
  refresh();
  return { id: p.id, itemId: p.itemId, date: p.date.toISOString(), amountCents: p.amountCents, note: p.note };
}

export async function restoreReservePurchase(snapshot: ReservePurchaseSnapshot): Promise<ActionState> {
  const user = await requireFeature("reserves.use");
  const s = purchaseSnap.safeParse(snapshot);
  if (!s.success) return { error: "Wiederherstellen nicht möglich." };
  const item = await prisma.reserveItem.findFirst({ where: { id: s.data.itemId, userId: user.id } });
  if (!item) return { error: "Der Posten existiert nicht mehr." };
  await prisma.reservePurchase.create({ data: { id: s.data.id, itemId: item.id, date: new Date(s.data.date), amountCents: s.data.amountCents, note: s.data.note } });
  refresh();
  return { success: "Wiederhergestellt." };
}

// ---------------------------------------------------------------- Rücklagen-Einstellungen

export async function saveReserveSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireFeature("reserves.use");
  const parsed = z
    .object({
      monthly: z.string().transform((v, ctx) => {
        const c = parseEuroToCents(v || "0");
        if (c === null || c < 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Bitte einen gültigen Monatsbetrag eingeben." });
          return z.NEVER;
        }
        return c;
      }),
      tolerance: z.coerce.number().int().min(0, "Toleranz 0–50 %").max(50, "Toleranz 0–50 %"),
      accountKind: z.enum(["SPAREN", "NOTGROSCHEN"]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  await prisma.settings.update({
    where: { userId: user.id },
    data: { reserveMonthlyCents: parsed.data.monthly, reserveTolerancePct: parsed.data.tolerance, reserveAccountKind: parsed.data.accountKind },
  });
  refresh();
  return { success: "Rücklagen-Einstellungen gespeichert." };
}

/** Prognose als festgesetzten Monatsbetrag übernehmen (auf volle Euro aufgerundet). */
export async function applyReserveForecast(): Promise<ActionState> {
  const user = await requireFeature("reserves.use");
  const [items, settings] = await Promise.all([
    prisma.reserveItem.findMany({ where: { userId: user.id }, include: { purchases: true } }),
    prisma.settings.findUniqueOrThrow({ where: { userId: user.id } }),
  ]);
  const summary = reserveSummary(items, settings);
  const rounded = Math.ceil(summary.forecastMonthlyCents / 100) * 100;
  await prisma.settings.update({ where: { userId: user.id }, data: { reserveMonthlyCents: rounded } });
  refresh();
  return { success: "Prognose übernommen." };
}

// ---------------------------------------------------------------- Daueraufträge & Umbuchungen

/** "Daueraufträge anpassen erledigt": aktuelle Empfehlung als eingerichtet merken, gültig ab dem 1. des nächsten Monats. */
export async function confirmStandingOrders(): Promise<ActionState> {
  const user = await requireUser();
  const { allocation } = await loadOverview(user.id);
  await prisma.settings.update({
    where: { userId: user.id },
    data: { confirmedOrders: JSON.stringify(allocation.orders), ordersValidFrom: ordersValidFrom(new Date()) },
  });
  refresh();
  return { success: "Daueraufträge als eingerichtet gemerkt." };
}

const transferSchema = z.object({
  from: z.enum(ACCOUNT_KINDS),
  to: z.enum(ACCOUNT_KINDS),
  amountCents: z.number().int().positive().max(100_000_000),
  note: z.string().trim().max(100).optional(),
});

/** Vorgeschlagene Umbuchung als erledigt verbuchen (die echte Überweisung machst du in deiner Bank-App). */
export async function bookSuggestedTransfer(input: z.input<typeof transferSchema>): Promise<ActionState> {
  const user = await requireUser();
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return { error: "Ungültige Umbuchung." };
  try {
    const { from, to, amountCents, note } = parsed.data;
    const res = await bookTransfer(user.id, from as AccountKind, to as AccountKind, amountCents, note);
    refresh();
    return { success: `Gebucht: ${res.from} → ${res.to}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Umbuchung fehlgeschlagen." };
  }
}
