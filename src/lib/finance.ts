/**
 * Rechenkern des Vier-Konten-Systems (reine Funktionen, keine DB-Zugriffe).
 *
 * Die Logik folgt der Excel-Vorlage "Kontensystem":
 *  - Einkommen landet auf dem Fixkostenkonto.
 *  - Monatliche Fixkosten werden direkt bezahlt.
 *  - Unregelmäßige Zahlungen (alle n Monate) werden in gleichen Monatsraten
 *    auf dem Fixkostenkonto zurückgelegt ("effektiv monatlich").
 *  - Der Rest wird per Dauerauftrag auf Sparen, Notgroschen und Freizeit verteilt.
 *  - Ein Mindestpuffer auf dem Fixkostenkonto darf nie unterschritten werden.
 */
import type { AccountKind } from "./constants";

export interface PaymentLike {
  id?: string;
  name: string;
  amountCents: number;
  direction: "IN" | "OUT" | string;
  dayOfMonth: number;
  intervalMonths: number;
  startMonth: number;
  accountKind: AccountKind;
  category?: string;
  active?: boolean;
}

export interface SettingsLike {
  minBufferCents: number;
  emergencyMonths: number;
  savingsRatePct: number;
  emergencyRatePct: number;
  transferDay: number;
  /** Festgesetzter Monatsbetrag für Rücklagen (Excel: "Festgesetzter mtl. Betrag") */
  reserveMonthlyCents?: number;
  /** Konto für Rücklagen */
  reserveAccountKind?: string;
}

export type Balances = Record<AccountKind, number>;

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Fällt die Zahlung im Monat `month` (1–12) an? */
export function occursInMonth(p: Pick<PaymentLike, "intervalMonths" | "startMonth">, month: number): boolean {
  const interval = Math.max(1, p.intervalMonths);
  return mod(month - p.startMonth, interval) === 0;
}

/** Betrag pro Monat, wenn eine Zahlung gleichmäßig angespart wird. */
export function monthlyEquivalent(p: Pick<PaymentLike, "amountCents" | "intervalMonths">): number {
  return Math.round(p.amountCents / Math.max(1, p.intervalMonths));
}

function activeOnly(payments: PaymentLike[]) {
  return payments.filter((p) => p.active !== false);
}

export interface MonthlySummary {
  incomeCents: number;
  fixedMonthlyCents: number;
  irregularMonthlyCents: number;
  fixedTotalCents: number;
}

/** Einkommen und Fixkosten pro Monat (unregelmäßige Kosten als Monatsrate). */
export function summarize(payments: PaymentLike[]): MonthlySummary {
  let income = 0;
  let fixed = 0;
  let irregular = 0;
  for (const p of activeOnly(payments)) {
    const m = monthlyEquivalent(p);
    if (p.direction === "IN") income += m;
    else if (p.accountKind === "FIXKOSTEN") {
      if (p.intervalMonths > 1) irregular += m;
      else fixed += m;
    }
  }
  return {
    incomeCents: income,
    fixedMonthlyCents: fixed,
    irregularMonthlyCents: irregular,
    fixedTotalCents: fixed + irregular,
  };
}

export interface Allocation {
  incomeCents: number;
  fixkostenCents: number;
  /** Rücklagen für geplante/unregelmäßige Ausgaben (Excel-Blatt "Reserve") */
  reserveCents: number;
  reserveAccountKind: "SPAREN" | "NOTGROSCHEN";
  sparenCents: number;
  notgroschenCents: number;
  freizeitCents: number;
  /** Empfohlene Daueraufträge vom Fixkostenkonto je Zielkonto (Rücklagen eingerechnet) */
  orders: Record<"SPAREN" | "NOTGROSCHEN" | "FREIZEIT", number>;
  emergencyTargetCents: number;
  emergencyReached: boolean;
  warnings: string[];
}

/**
 * Empfohlene monatliche Verteilung des Einkommens auf die vier Konten.
 * Reihenfolge: Fixkosten > Rücklagen (festgesetzter Betrag) > Notgroschen (bis Ziel erreicht) > Sparen > Freizeit (Rest).
 * Entspricht der Excel: Konto 4 ("Spaß") bekommt, was nach allen anderen Daueraufträgen übrig bleibt.
 */
export function allocate(summary: MonthlySummary, settings: SettingsLike, balances: Balances): Allocation {
  const warnings: string[] = [];
  const income = summary.incomeCents;
  const fix = summary.fixedTotalCents;
  const emergencyTarget = summary.fixedTotalCents * settings.emergencyMonths;
  const emergencyMissing = Math.max(0, emergencyTarget - balances.NOTGROSCHEN);
  const reserveKind = settings.reserveAccountKind === "NOTGROSCHEN" ? "NOTGROSCHEN" : "SPAREN";

  let available = income - fix;
  if (available < 0) {
    warnings.push("Deine Fixkosten sind höher als dein Einkommen. Prüfe Ausgaben oder Einnahmen.");
    available = 0;
  }

  const wantedReserve = Math.max(0, settings.reserveMonthlyCents ?? 0);
  const reserve = Math.min(wantedReserve, available);
  available -= reserve;
  if (reserve < wantedReserve) warnings.push("Für den festgesetzten Rücklagen-Betrag reicht dein Einkommen nicht ganz.");

  let notgroschen = Math.min(emergencyMissing, Math.round((income * settings.emergencyRatePct) / 100));
  notgroschen = Math.min(notgroschen, available);
  available -= notgroschen;

  const sparen = Math.min(Math.round((income * settings.savingsRatePct) / 100), available);
  available -= sparen;

  const freizeit = available;

  if (income > 0 && freizeit < income * 0.05) {
    warnings.push("Für Freizeit bleibt sehr wenig übrig. Sparquote oder Rücklagen prüfen.");
  }
  if (emergencyMissing > 0 && notgroschen === 0 && income > 0) {
    warnings.push("Dein Notgroschen ist noch nicht vollständig, aber es ist kein Geld dafür übrig.");
  }

  return {
    incomeCents: income,
    fixkostenCents: fix,
    reserveCents: reserve,
    reserveAccountKind: reserveKind,
    sparenCents: sparen,
    notgroschenCents: notgroschen,
    freizeitCents: freizeit,
    orders: {
      SPAREN: sparen + (reserveKind === "SPAREN" ? reserve : 0),
      NOTGROSCHEN: notgroschen + (reserveKind === "NOTGROSCHEN" ? reserve : 0),
      FREIZEIT: freizeit,
    },
    emergencyTargetCents: emergencyTarget,
    emergencyReached: emergencyMissing === 0,
    warnings,
  };
}

function daysInMonth(year: number, month0: number) {
  return new Date(year, month0 + 1, 0).getDate();
}

export interface ForecastPoint {
  date: string; // ISO yyyy-mm-dd
  label: string; // dd.mm.
  balanceCents: number;
}

/**
 * Tagesgenaue Prognose des Fixkostenkontos (entspricht "Saldo-Verlauf" im Excel-Dashboard).
 * Unregelmäßige Zahlungen werden am Fälligkeitstag voll abgebucht.
 */
export function forecastFixkosten(
  startBalanceCents: number,
  start: Date,
  days: number,
  payments: PaymentLike[],
  allocation: Allocation,
  transferDay: number,
): { points: ForecastPoint[]; minBalanceCents: number; minDate: string } {
  const transfersOut = allocation.orders.SPAREN + allocation.orders.NOTGROSCHEN + allocation.orders.FREIZEIT;
  const relevant = activeOnly(payments).filter((p) => p.accountKind === "FIXKOSTEN" || p.direction === "IN");
  let balance = startBalanceCents;
  const points: ForecastPoint[] = [];
  let min = balance;
  let minDate = start.toISOString().slice(0, 10);

  for (let i = 0; i <= days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const dim = daysInMonth(d.getFullYear(), d.getMonth());
    if (i > 0) {
      for (const p of relevant) {
        const due = Math.min(p.dayOfMonth, dim);
        if (due === day && occursInMonth(p, month)) {
          balance += p.direction === "IN" ? p.amountCents : -p.amountCents;
        }
      }
      if (Math.min(transferDay, dim) === day) balance -= transfersOut;
    }
    const iso = `${d.getFullYear()}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    points.push({ date: iso, label: `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.`, balanceCents: balance });
    if (balance < min) {
      min = balance;
      minDate = iso;
    }
  }
  return { points, minBalanceCents: min, minDate };
}

export interface YearPlanRow {
  month: number;
  monthlyCents: number;
  irregularDueCents: number;
  reserveCents: number;
}

/**
 * Jahresverlauf der Rücklage für unregelmäßige Zahlungen ("Nicht-Mtl." im Excel).
 * Jeden Monat wird die Monatsrate eingezahlt, bei Fälligkeit der volle Betrag entnommen.
 * `requiredStartCents` ist das Startguthaben, damit die Rücklage nie ins Minus fällt.
 */
export function yearPlan(payments: PaymentLike[]): { rows: YearPlanRow[]; requiredStartCents: number; roundingPerYearCents: number } {
  const fixOut = activeOnly(payments).filter((p) => p.direction !== "IN" && p.accountKind === "FIXKOSTEN");
  const irregular = fixOut.filter((p) => p.intervalMonths > 1);
  const monthlyRate = irregular.reduce((s, p) => s + monthlyEquivalent(p), 0);
  const monthlyFixed = fixOut.filter((p) => p.intervalMonths <= 1).reduce((s, p) => s + p.amountCents, 0);

  let reserve = 0;
  let lowest = 0;
  const rows: YearPlanRow[] = [];
  for (let m = 1; m <= 12; m++) {
    const due = irregular.filter((p) => occursInMonth(p, m)).reduce((s, p) => s + p.amountCents, 0);
    reserve += monthlyRate - due;
    lowest = Math.min(lowest, reserve);
    rows.push({ month: m, monthlyCents: monthlyFixed, irregularDueCents: due, reserveCents: reserve });
  }
  const requiredStart = -lowest;
  // Durch das Runden der Monatsraten bleibt pro Jahr ein kleiner Rest übrig (oder fehlt)
  const roundingPerYear = irregular.reduce((sum, p) => sum + monthlyEquivalent(p) * 12 - p.amountCents * (12 / Math.max(1, p.intervalMonths)), 0);
  return {
    rows: rows.map((r) => ({ ...r, reserveCents: r.reserveCents + requiredStart })),
    requiredStartCents: requiredStart,
    roundingPerYearCents: Math.round(roundingPerYear),
  };
}

export interface ProjectionPoint {
  label: string;
  SPAREN: number;
  NOTGROSCHEN: number;
  FREIZEIT: number;
  FIXKOSTEN: number;
}

/**
 * Prognose der Kontostände für die nächsten `months` Monate.
 * Annahme: Freizeitbudget wird ausgegeben, Notgroschen wird bis zum Ziel aufgefüllt,
 * danach fließt die Notgroschen-Rate zusätzlich aufs Sparkonto.
 */
export function projectBalances(balances: Balances, allocation: Allocation, months: number, start = new Date()): ProjectionPoint[] {
  const out: ProjectionPoint[] = [];
  let spar = balances.SPAREN;
  let not = balances.NOTGROSCHEN;
  for (let i = 0; i <= months; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    if (i > 0) {
      const room = Math.max(0, allocation.emergencyTargetCents - not);
      const toEmergency = Math.min(allocation.notgroschenCents, room);
      not += toEmergency;
      spar += allocation.sparenCents + (allocation.notgroschenCents - toEmergency);
    }
    out.push({
      label: d.toLocaleDateString("de-DE", { month: "short", year: "2-digit" }),
      SPAREN: spar / 100,
      NOTGROSCHEN: not / 100,
      FREIZEIT: balances.FREIZEIT / 100,
      FIXKOSTEN: balances.FIXKOSTEN / 100,
    });
  }
  return out;
}

/** Durchschnittliches Kaufintervall und effektiver Monatsbetrag (Excel-Blatt "Urlaub"). */
export function irregularPurchaseStats(purchases: { date: Date; amountCents: number }[]) {
  const sorted = [...purchases].sort((a, b) => a.date.getTime() - b.date.getTime());
  if (sorted.length < 2) return null;
  const totalDays = (sorted[sorted.length - 1].date.getTime() - sorted[0].date.getTime()) / 86_400_000;
  const avgIntervalDays = totalDays / (sorted.length - 1);
  // Letzter Kauf zählt nicht mit, weil sein Intervall noch nicht abgelaufen ist.
  const spentWithoutLast = sorted.slice(0, -1).reduce((s, p) => s + p.amountCents, 0);
  const perMonth = totalDays > 0 ? Math.round((spentWithoutLast / totalDays) * 30.4375) : 0;
  return { avgIntervalDays: Math.round(avgIntervalDays), perMonthCents: perMonth };
}
