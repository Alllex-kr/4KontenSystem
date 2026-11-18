/**
 * Planungs-Logik nach der Excel "Kontensystem V48" (reine Funktionen, testbar):
 *  - Rücklagen (Blatt "Reserve" + Dokumentations-Blätter "Urlaub", "Doku_2" …)
 *  - Ausgleichszahlung / Zusatz-Zahlung (Dashboard "Puffer" + "Ausgleichszahlung an/von Konto 1")
 *  - Notwendige Überweisungen (Blatt "START": Kontostände aktuell vs. Empfehlung)
 *  - Erledigt-Checkliste (Makros "Daueraufträge anpassen erledigt", "Ausgleichszahlung erledigt", "gültig ab")
 */
import type { AccountKind } from "./constants";
import { irregularPurchaseStats } from "./finance";

const DAY = 86_400_000;
const MONTH_DAYS = 30.4375;

export function monthsBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / DAY / MONTH_DAYS;
}

export function addMonths(d: Date, months: number): Date {
  const whole = Math.floor(months);
  const r = new Date(d.getFullYear(), d.getMonth() + whole, d.getDate(), 12);
  const rest = months - whole;
  if (rest > 0) r.setDate(r.getDate() + Math.round(rest * MONTH_DAYS));
  return r;
}

// ------------------------------------------------------------------ Rücklagen

export interface ReserveItemLike {
  id: string;
  name: string;
  kind: "PLANNED" | "IRREGULAR" | string;
  plannedIntervalMonths: number | null;
  plannedAmountCents: number | null;
  useEffective: boolean;
  createdAt: Date;
  purchases: { date: Date; amountCents: number }[];
}

export interface ReserveItemStats {
  /** Betrag, der pro Monat zurückgelegt werden sollte */
  monthlyCents: number;
  /** verwendetes Intervall in Monaten */
  intervalMonths: number | null;
  /** aus vorletztem und letztem Kauf berechnet (Excel: "Häufigkeit – Berechnet") */
  computedIntervalMonths: number | null;
  nextDate: Date | null;
  /** Betrag, der für die nächste Fälligkeit gebraucht wird */
  targetCents: number;
  /** so viel sollte seit dem letzten Kauf schon angespart sein (Soll-Rücklage) */
  accruedCents: number;
  // nur unregelmäßig:
  effectiveMonthlyCents: number | null;
  estimateMonthlyCents: number | null;
  avgIntervalDays: number | null;
  avgAmountCents: number | null;
  purchaseCount: number;
}

export function reserveItemStats(item: ReserveItemLike, today = new Date()): ReserveItemStats {
  const purchases = [...item.purchases].sort((a, b) => a.date.getTime() - b.date.getTime());
  const last = purchases.at(-1) ?? null;
  const prev = purchases.length >= 2 ? purchases[purchases.length - 2] : null;
  const avgAmount = purchases.length ? Math.round(purchases.reduce((s, p) => s + p.amountCents, 0) / purchases.length) : null;
  const accrualStart = last?.date ?? item.createdAt;
  const monthsSince = Math.max(0, monthsBetween(accrualStart, today));

  if (item.kind === "IRREGULAR") {
    const stats = irregularPurchaseStats(purchases);
    const estimate =
      item.plannedIntervalMonths && item.plannedAmountCents != null
        ? Math.round(item.plannedAmountCents / Math.max(1, item.plannedIntervalMonths))
        : null;
    // Excel: "Mit effektivem Betrag rechnen? (x)" → tatsächlicher Wert, sonst Schätzung (Intervall + Betrag)
    const monthly = item.useEffective && stats ? stats.perMonthCents : (estimate ?? stats?.perMonthCents ?? 0);
    const interval = item.plannedIntervalMonths ?? (stats ? Math.round((stats.avgIntervalDays / MONTH_DAYS) * 10) / 10 : null);
    const target = item.plannedAmountCents ?? avgAmount ?? 0;
    return {
      monthlyCents: monthly,
      intervalMonths: interval,
      computedIntervalMonths: stats ? Math.round((stats.avgIntervalDays / MONTH_DAYS) * 10) / 10 : null,
      nextDate: last && interval ? addMonths(last.date, interval) : null,
      targetCents: target,
      accruedCents: Math.min(target, Math.round(monthly * monthsSince)),
      effectiveMonthlyCents: stats?.perMonthCents ?? null,
      estimateMonthlyCents: estimate,
      avgIntervalDays: stats?.avgIntervalDays ?? null,
      avgAmountCents: avgAmount,
      purchaseCount: purchases.length,
    };
  }

  // PLANNED: Intervall geplant oder aus den letzten zwei Käufen, Betrag geplant oder letzter Kauf
  const computed = prev && last ? Math.max(1, Math.round(monthsBetween(prev.date, last.date))) : null;
  const interval = item.plannedIntervalMonths ?? computed ?? 12;
  const amount = item.plannedAmountCents ?? last?.amountCents ?? 0;
  const monthly = Math.round(amount / Math.max(1, interval));
  return {
    monthlyCents: monthly,
    intervalMonths: interval,
    computedIntervalMonths: computed,
    nextDate: last ? addMonths(last.date, interval) : null,
    targetCents: amount,
    accruedCents: Math.min(amount, Math.round(monthly * monthsSince)),
    effectiveMonthlyCents: null,
    estimateMonthlyCents: null,
    avgIntervalDays: null,
    avgAmountCents: avgAmount,
    purchaseCount: purchases.length,
  };
}

export interface ReserveSummary {
  /** Excel: "Effektiv pro Monat (Prognose)" */
  forecastMonthlyCents: number;
  /** Excel: "Festgesetzter mtl. Betrag" */
  fixedMonthlyCents: number;
  /** Excel: "Aktuell zu wenig eingeplant?" */
  underplanned: boolean;
  /** Soll-Stand der Rücklagen heute (Summe der angesparten Beträge) */
  sollBalanceCents: number;
  /** Posten, die in den nächsten 31 Tagen fällig werden */
  dueSoon: { id: string; name: string; date: Date; targetCents: number; accruedCents: number }[];
}

export function reserveSummary(
  items: ReserveItemLike[],
  settings: { reserveMonthlyCents: number; reserveTolerancePct: number },
  today = new Date(),
): ReserveSummary & { stats: Map<string, ReserveItemStats> } {
  const stats = new Map(items.map((i) => [i.id, reserveItemStats(i, today)]));
  const forecast = [...stats.values()].reduce((s, x) => s + x.monthlyCents, 0);
  const soll = [...stats.values()].reduce((s, x) => s + x.accruedCents, 0);
  const limit = today.getTime() + 31 * DAY;
  const dueSoon = items
    .map((i) => ({ i, st: stats.get(i.id)! }))
    .filter(({ st }) => st.nextDate && st.nextDate.getTime() <= limit)
    .map(({ i, st }) => ({ id: i.id, name: i.name, date: st.nextDate!, targetCents: st.targetCents, accruedCents: st.accruedCents }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return {
    forecastMonthlyCents: forecast,
    fixedMonthlyCents: settings.reserveMonthlyCents,
    underplanned: forecast > 0 && settings.reserveMonthlyCents < forecast * (1 - settings.reserveTolerancePct / 100),
    sollBalanceCents: soll,
    dueSoon,
    stats,
  };
}

// ------------------------------------------------------------------ Ausgleich

export interface Ausgleich {
  /** tiefster Stand des Fixkostenkontos in der Prognose (Excel: "Aktueller Puffer-Saldo") */
  lowestCents: number;
  lowestDate: string;
  /** so viel muss aufs Fixkostenkonto, damit der Mindestpuffer hält */
  requiredInCents: number;
  /** so viel könnte vom Fixkostenkonto weg, ohne den Mindestpuffer zu unterschreiten (Excel: "Maximal mögliche Auszahlung") */
  maxPayoutCents: number;
}

export function ausgleich(lowestCents: number, lowestDate: string, minBufferCents: number): Ausgleich {
  const diff = lowestCents - minBufferCents;
  return { lowestCents, lowestDate, requiredInCents: diff < 0 ? -diff : 0, maxPayoutCents: diff > 0 ? diff : 0 };
}

/**
 * Zusatz-Zahlung (Excel: "+ Einzahlung / − Auszahlung"): ergibt die Überweisung zwischen Fixkostenkonto und Gegenkonto.
 * Positiv = aufs Fixkostenkonto, negativ = vom Fixkostenkonto weg. Eine Auszahlung darf den Mindestpuffer nicht unterschreiten.
 */
export function ausgleichsUeberweisung(a: Ausgleich, zusatzCents: number): { transferCents: number; error?: string } {
  if (zusatzCents < 0 && -zusatzCents > a.maxPayoutCents) {
    return { transferCents: 0, error: `Maximal ${(a.maxPayoutCents / 100).toFixed(2).replace(".", ",")} € können vom Fixkostenkonto weg, ohne den Mindestpuffer zu unterschreiten.` };
  }
  return { transferCents: a.requiredInCents + zusatzCents };
}

// ------------------------------------------------------------------ Notwendige Überweisungen

export interface TransferSuggestion {
  from: AccountKind;
  to: AccountKind;
  amountCents: number;
  reason: string;
}

export interface RebalanceInput {
  balances: Record<AccountKind, number>;
  /** tiefster Prognose-Stand minus Mindestpuffer (negativ = Fehlbetrag) */
  fixSurplusCents: number;
  reserve: { accountKind: "SPAREN" | "NOTGROSCHEN"; sollCents: number; earmarkedCents: number };
  emergencyTargetCents: number;
  /** Freizeit-Guthaben über dem Rest-Budget dieses Monats */
  freizeitFreeCents: number;
}

const roundUpEuro = (c: number) => Math.ceil(c / 100) * 100;

/**
 * Vergleicht Ist und Soll je Konto und schlägt Umbuchungen vor (Excel START: "Notwendige Überweisungen").
 * Fehlbeträge: Fixkostenkonto (Mindestpuffer), Rücklagen-Konto (Soll-Rücklage).
 * Gedeckt aus: Überschuss Fixkosten, Notgroschen über Ziel, frei verfügbares Freizeit-Guthaben.
 */
export function rebalance(input: RebalanceInput): { transfers: TransferSuggestion[]; uncovered: { to: AccountKind; amountCents: number; reason: string }[] } {
  const deficits: { to: AccountKind; amount: number; reason: string }[] = [];
  if (input.fixSurplusCents < 0) deficits.push({ to: "FIXKOSTEN", amount: roundUpEuro(-input.fixSurplusCents), reason: "Mindestpuffer auf dem Fixkostenkonto halten" });
  const r = input.reserve;
  const reserveAvail = input.balances[r.accountKind] - r.earmarkedCents;
  if (r.sollCents > 0 && reserveAvail < r.sollCents) deficits.push({ to: r.accountKind, amount: roundUpEuro(r.sollCents - reserveAvail), reason: "Rücklagen auf Soll-Stand bringen" });

  const surpluses: { from: AccountKind; amount: number }[] = [];
  if (input.fixSurplusCents > 0) surpluses.push({ from: "FIXKOSTEN", amount: Math.floor(input.fixSurplusCents / 100) * 100 });
  if (r.accountKind !== "NOTGROSCHEN" && input.emergencyTargetCents > 0 && input.balances.NOTGROSCHEN > input.emergencyTargetCents) {
    surpluses.push({ from: "NOTGROSCHEN", amount: Math.floor((input.balances.NOTGROSCHEN - input.emergencyTargetCents) / 100) * 100 });
  }
  if (input.freizeitFreeCents > 0) surpluses.push({ from: "FREIZEIT", amount: Math.floor(input.freizeitFreeCents / 100) * 100 });

  const transfers: TransferSuggestion[] = [];
  const uncovered: { to: AccountKind; amountCents: number; reason: string }[] = [];
  for (const d of deficits) {
    let need = d.amount;
    for (const s of surpluses) {
      if (need <= 0) break;
      if (s.from === d.to || s.amount <= 0) continue;
      const take = Math.min(need, s.amount);
      if (take < 100) continue;
      transfers.push({ from: s.from, to: d.to, amountCents: take, reason: d.reason });
      s.amount -= take;
      need -= take;
    }
    if (need >= 100) uncovered.push({ to: d.to, amountCents: need, reason: d.reason });
  }
  return { transfers, uncovered };
}

// ------------------------------------------------------------------ Daueraufträge

export type Orders = Record<"SPAREN" | "NOTGROSCHEN" | "FREIZEIT", number>;

export function parseOrders(json: string | null | undefined): Orders | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json);
    if (["SPAREN", "NOTGROSCHEN", "FREIZEIT"].every((k) => Number.isInteger(o?.[k]))) return o as Orders;
  } catch {
    /* ungültig */
  }
  return null;
}

/** Unterschiede zwischen eingerichteten und empfohlenen Daueraufträgen (ab 1 €). */
export function ordersDiff(confirmed: Orders | null, recommended: Orders): { kind: keyof Orders; fromCents: number | null; toCents: number }[] {
  return (Object.keys(recommended) as (keyof Orders)[])
    .filter((k) => !confirmed || Math.abs(confirmed[k] - recommended[k]) >= 100)
    .map((k) => ({ kind: k, fromCents: confirmed ? confirmed[k] : null, toCents: recommended[k] }));
}

/** Neue Daueraufträge gelten ab dem 1. des nächsten Monats (Excel: EOMONTH(Letzte Änderung) + 1). */
export function ordersValidFrom(changeDate: Date): Date {
  return new Date(changeDate.getFullYear(), changeDate.getMonth() + 1, 1, 12);
}

// ------------------------------------------------------------------ Checkliste

export type TodoKind = "ausgleich" | "transfer" | "orders" | "balance" | "reserve" | "due";

export interface Todo {
  id: string;
  kind: TodoKind;
  severity: "high" | "medium" | "low";
  title: string;
  detail?: string;
}

export function buildTodos(input: {
  ausgleich: Ausgleich;
  transfers: TransferSuggestion[];
  uncovered: { to: AccountKind; amountCents: number; reason: string }[];
  ordersDiff: ReturnType<typeof ordersDiff>;
  hasConfirmedOrders: boolean;
  staleAccounts: { kind: AccountKind; name: string; days: number | null }[];
  reserveUnderplanned: boolean;
  dueSoon: ReserveSummary["dueSoon"];
  names: Record<AccountKind, string>;
  fmt: (c: number) => string;
  fmtDate: (d: Date | string) => string;
}): Todo[] {
  const t: Todo[] = [];
  const { fmt, fmtDate, names } = input;
  if (input.ausgleich.requiredInCents > 0) {
    t.push({
      id: "ausgleich",
      kind: "ausgleich",
      severity: "high",
      title: `Ausgleichszahlung: ${fmt(roundUpEuro(input.ausgleich.requiredInCents))} aufs ${names.FIXKOSTEN}`,
      detail: `Sonst fällt es am ${fmtDate(input.ausgleich.lowestDate)} unter den Mindestpuffer.`,
    });
  }
  input.transfers
    .filter((x) => !(x.to === "FIXKOSTEN" && input.ausgleich.requiredInCents > 0))
    .forEach((x, i) => t.push({ id: `transfer-${i}`, kind: "transfer", severity: "medium", title: `${names[x.from]} → ${names[x.to]}: ${fmt(x.amountCents)}`, detail: x.reason }));
  input.uncovered
    .filter((u) => u.to !== "FIXKOSTEN")
    .forEach((u, i) => t.push({ id: `uncovered-${i}`, kind: "transfer", severity: "medium", title: `${names[u.to]}: ${fmt(u.amountCents)} fehlen`, detail: `${u.reason}. Kein anderes Konto hat gerade genug übrig.` }));
  if (input.ordersDiff.length) {
    t.push({
      id: "orders",
      kind: "orders",
      severity: "medium",
      title: input.hasConfirmedOrders ? "Daueraufträge anpassen" : "Daueraufträge einrichten",
      detail: input.ordersDiff.map((d) => `${names[d.kind]}: ${d.fromCents == null ? "" : `${fmt(d.fromCents)} → `}${fmt(d.toCents)}`).join(" · "),
    });
  }
  input.staleAccounts.forEach((a) =>
    t.push({
      id: `balance-${a.kind}`,
      kind: "balance",
      severity: "low",
      title: `Kontostand abgleichen: ${a.name}`,
      detail: a.days == null ? "Noch nie mit der Bank abgeglichen." : `Zuletzt vor ${a.days} Tagen abgeglichen.`,
    }),
  );
  if (input.reserveUnderplanned) {
    t.push({ id: "reserve", kind: "reserve", severity: "medium", title: "Rücklagen: aktuell zu wenig eingeplant", detail: "Der festgesetzte Monatsbetrag liegt unter der Prognose." });
  }
  input.dueSoon.forEach((d) =>
    t.push({
      id: `due-${d.id}`,
      kind: "due",
      severity: d.accruedCents < d.targetCents ? "medium" : "low",
      title: `${d.name} fällig am ${fmtDate(d.date)}`,
      detail: `Geplant ${fmt(d.targetCents)}, angespart ${fmt(d.accruedCents)}.`,
    }),
  );
  const order = { high: 0, medium: 1, low: 2 };
  return t.sort((a, b) => order[a.severity] - order[b.severity]);
}
