import { describe, expect, it } from "vitest";
import {
  allocate,
  forecastFixkosten,
  irregularPurchaseStats,
  monthlyEquivalent,
  occursInMonth,
  projectBalances,
  summarize,
  yearPlan,
  type PaymentLike,
} from "./finance";

const settings = { minBufferCents: 10000, emergencyMonths: 3, savingsRatePct: 10, emergencyRatePct: 10, transferDay: 1 };

const payments: PaymentLike[] = [
  { name: "Nebenjob", amountCents: 120000, direction: "IN", dayOfMonth: 1, intervalMonths: 1, startMonth: 1, accountKind: "FIXKOSTEN" },
  { name: "Miete", amountCents: 40000, direction: "OUT", dayOfMonth: 3, intervalMonths: 1, startMonth: 1, accountKind: "FIXKOSTEN" },
  { name: "Semesterbeitrag", amountCents: 30000, direction: "OUT", dayOfMonth: 15, intervalMonths: 6, startMonth: 3, accountKind: "FIXKOSTEN" },
  { name: "Haftpflicht", amountCents: 6000, direction: "OUT", dayOfMonth: 1, intervalMonths: 12, startMonth: 1, accountKind: "FIXKOSTEN" },
];

describe("Intervalle", () => {
  it("erkennt Fälligkeitsmonate", () => {
    expect(occursInMonth({ intervalMonths: 6, startMonth: 3 }, 3)).toBe(true);
    expect(occursInMonth({ intervalMonths: 6, startMonth: 3 }, 9)).toBe(true);
    expect(occursInMonth({ intervalMonths: 6, startMonth: 3 }, 4)).toBe(false);
    expect(occursInMonth({ intervalMonths: 12, startMonth: 11 }, 1)).toBe(false);
  });
  it("rechnet Monatsraten", () => {
    expect(monthlyEquivalent({ amountCents: 30000, intervalMonths: 6 })).toBe(5000);
  });
});

describe("Verteilung", () => {
  const s = summarize(payments);
  it("fasst Einkommen und Fixkosten zusammen", () => {
    expect(s.incomeCents).toBe(120000);
    expect(s.fixedMonthlyCents).toBe(40000);
    expect(s.irregularMonthlyCents).toBe(5000 + 500);
  });
  it("verteilt das gesamte Einkommen", () => {
    const a = allocate(s, settings, { FIXKOSTEN: 0, SPAREN: 0, NOTGROSCHEN: 0, FREIZEIT: 0 });
    expect(a.fixkostenCents + a.reserveCents + a.sparenCents + a.notgroschenCents + a.freizeitCents).toBe(a.incomeCents);
    expect(a.notgroschenCents).toBe(12000);
    expect(a.sparenCents).toBe(12000);
  });
  it("zahlt nichts mehr in den Notgroschen, wenn das Ziel erreicht ist", () => {
    const a = allocate(s, settings, { FIXKOSTEN: 0, SPAREN: 0, NOTGROSCHEN: 10_000_000, FREIZEIT: 0 });
    expect(a.notgroschenCents).toBe(0);
    expect(a.emergencyReached).toBe(true);
  });
  it("warnt bei Fixkosten über dem Einkommen", () => {
    const a = allocate({ incomeCents: 100, fixedMonthlyCents: 500, irregularMonthlyCents: 0, fixedTotalCents: 500 }, settings, {
      FIXKOSTEN: 0, SPAREN: 0, NOTGROSCHEN: 0, FREIZEIT: 0,
    });
    expect(a.warnings.length).toBeGreaterThan(0);
    expect(a.freizeitCents).toBe(0);
  });
});

describe("Prognosen", () => {
  it("Rücklage für unregelmäßige Zahlungen fällt nie unter null", () => {
    const { rows, requiredStartCents } = yearPlan(payments);
    expect(rows).toHaveLength(12);
    expect(Math.min(...rows.map((r) => r.reserveCents))).toBe(0);
    expect(requiredStartCents).toBeGreaterThan(0);
  });
  it("Tagesprognose bucht Einkommen und Miete", () => {
    const s = summarize(payments);
    const a = allocate(s, settings, { FIXKOSTEN: 0, SPAREN: 0, NOTGROSCHEN: 0, FREIZEIT: 0 });
    const f = forecastFixkosten(50000, new Date(2026, 4, 31), 3, payments, a, 1);
    // 1. Juni: +1200 Einkommen, - Umbuchungen; 3. Juni: -400 Miete
    const transfers = a.sparenCents + a.notgroschenCents + a.freizeitCents;
    expect(f.points[1].balanceCents).toBe(50000 + 120000 - transfers);
    expect(f.points[3].balanceCents).toBe(50000 + 120000 - transfers - 40000);
  });
  it("Kontoprognose füllt erst den Notgroschen", () => {
    const s = summarize(payments);
    const a = allocate(s, settings, { FIXKOSTEN: 0, SPAREN: 0, NOTGROSCHEN: 0, FREIZEIT: 0 });
    const p = projectBalances({ FIXKOSTEN: 0, SPAREN: 0, NOTGROSCHEN: 0, FREIZEIT: 0 }, a, 24);
    expect(p.at(-1)!.NOTGROSCHEN).toBeCloseTo(a.emergencyTargetCents / 100, 2);
  });
  it("berechnet Kaufintervalle", () => {
    const r = irregularPurchaseStats([
      { date: new Date(2024, 0, 1), amountCents: 10000 },
      { date: new Date(2024, 2, 1), amountCents: 20000 },
    ]);
    expect(r?.avgIntervalDays).toBe(60);
  });
});
