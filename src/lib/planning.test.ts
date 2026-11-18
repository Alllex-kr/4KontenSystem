import { describe, expect, it } from "vitest";
import { allocate, summarize, type PaymentLike } from "./finance";
import {
  addMonths,
  ausgleich,
  ausgleichsUeberweisung,
  buildTodos,
  ordersDiff,
  ordersValidFrom,
  parseOrders,
  rebalance,
  reserveItemStats,
  reserveSummary,
  type ReserveItemLike,
} from "./planning";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12);
const today = d(2026, 11, 18);

describe("Rücklagen (Excel-Blatt Reserve)", () => {
  it("geplanter Posten: Intervall aus vorletztem/letztem Kauf, Betrag geplant (Weihnachtsgeschenke)", () => {
    // Excel: Vorletztes 21.11.22, Letztes 21.11.23 → Berechnet 12, Geplant 360 → 30 €/Monat
    const item: ReserveItemLike = {
      id: "w", name: "Weihnachtsgeschenke", kind: "PLANNED", plannedIntervalMonths: null, plannedAmountCents: 36000, useEffective: false,
      createdAt: d(2022, 1, 1), purchases: [{ date: d(2022, 11, 21), amountCents: 30000 }, { date: d(2023, 11, 21), amountCents: 34000 }],
    };
    const s = reserveItemStats(item, today);
    expect(s.computedIntervalMonths).toBe(12);
    expect(s.monthlyCents).toBe(3000);
    expect(s.nextDate?.getFullYear()).toBe(2024);
    expect(s.accruedCents).toBe(36000); // gedeckelt auf den Zielbetrag
  });

  it("unregelmäßiger Posten: effektiver Betrag aus Dokumentation (Urlaub)", () => {
    // Excel "Urlaub": 4 Käufe, 1200/600/200/500 → effektiver Betrag ohne letzten Kauf
    const item: ReserveItemLike = {
      id: "u", name: "Urlaub", kind: "IRREGULAR", plannedIntervalMonths: 12, plannedAmountCents: 250000, useEffective: false, createdAt: d(2023, 1, 1),
      purchases: [
        { date: d(2023, 5, 18), amountCents: 120000 },
        { date: d(2023, 9, 19), amountCents: 60000 },
        { date: d(2023, 12, 19), amountCents: 20000 },
        { date: d(2023, 12, 22), amountCents: 50000 },
      ],
    };
    const est = reserveItemStats(item, today);
    expect(est.estimateMonthlyCents).toBe(20833); // 2500 / 12 → 208,33 € (Excel O8)
    expect(est.monthlyCents).toBe(20833);
    expect(est.avgIntervalDays).toBe(73); // Excel G9
    const eff = reserveItemStats({ ...item, useEffective: true }, today);
    expect(eff.monthlyCents).toBe(eff.effectiveMonthlyCents);
    expect(eff.effectiveMonthlyCents).toBeGreaterThan(25000);
  });

  it("Prognose, Toleranz-Warnung und fällige Posten", () => {
    const items: ReserveItemLike[] = [
      { id: "a", name: "A", kind: "PLANNED", plannedIntervalMonths: 12, plannedAmountCents: 36000, useEffective: false, createdAt: d(2025, 1, 1), purchases: [{ date: d(2025, 12, 1), amountCents: 36000 }] },
      { id: "b", name: "B", kind: "PLANNED", plannedIntervalMonths: 6, plannedAmountCents: 12000, useEffective: false, createdAt: d(2025, 1, 1), purchases: [] },
    ];
    const ok = reserveSummary(items, { reserveMonthlyCents: 5000, reserveTolerancePct: 15 }, today);
    expect(ok.forecastMonthlyCents).toBe(5000);
    expect(ok.underplanned).toBe(false);
    expect(ok.dueSoon.map((x) => x.id)).toEqual(["a"]);
    const low = reserveSummary(items, { reserveMonthlyCents: 4000, reserveTolerancePct: 15 }, today);
    expect(low.underplanned).toBe(true);
  });
});

describe("Verteilung mit Rücklagen", () => {
  const payments: PaymentLike[] = [
    { name: "Job", amountCents: 140000, direction: "IN", dayOfMonth: 1, intervalMonths: 1, startMonth: 1, accountKind: "FIXKOSTEN" },
    { name: "Miete", amountCents: 50000, direction: "OUT", dayOfMonth: 3, intervalMonths: 1, startMonth: 1, accountKind: "FIXKOSTEN" },
  ];
  it("Rücklagen vor Notgroschen/Sparen, Freizeit bekommt den Rest, Aufträge je Konto", () => {
    const a = allocate(summarize(payments), { minBufferCents: 0, emergencyMonths: 3, savingsRatePct: 10, emergencyRatePct: 10, transferDay: 1, reserveMonthlyCents: 25000, reserveAccountKind: "SPAREN" }, {
      FIXKOSTEN: 0, SPAREN: 0, NOTGROSCHEN: 0, FREIZEIT: 0,
    });
    expect(a.reserveCents).toBe(25000);
    expect(a.orders.SPAREN).toBe(a.sparenCents + 25000);
    expect(a.fixkostenCents + a.reserveCents + a.notgroschenCents + a.sparenCents + a.freizeitCents).toBe(140000);
  });
});

describe("Ausgleich (Excel Dashboard: Puffer & Ausgleichszahlung)", () => {
  it("Fehlbetrag und mögliche Auszahlung", () => {
    expect(ausgleich(5000, "2026-12-03", 10000)).toMatchObject({ requiredInCents: 5000, maxPayoutCents: 0 });
    expect(ausgleich(40000, "2026-12-03", 10000)).toMatchObject({ requiredInCents: 0, maxPayoutCents: 30000 });
  });
  it("Zusatz-Zahlung: Einzahlung addiert, Auszahlung nur bis zum Puffer", () => {
    const a = ausgleich(40000, "x", 10000);
    expect(ausgleichsUeberweisung(a, 5000).transferCents).toBe(5000);
    expect(ausgleichsUeberweisung(a, -20000).transferCents).toBe(-20000);
    expect(ausgleichsUeberweisung(a, -40000).error).toBeTruthy();
    const need = ausgleich(5000, "x", 10000);
    expect(ausgleichsUeberweisung(need, 0).transferCents).toBe(5000);
  });
});

describe("Notwendige Überweisungen (Excel START)", () => {
  it("deckt Fehlbeträge aus Überschüssen, Fixkosten zuerst", () => {
    const { transfers, uncovered } = rebalance({
      balances: { FIXKOSTEN: 0, SPAREN: 100000, NOTGROSCHEN: 400000, FREIZEIT: 216870 },
      fixSurplusCents: -6450,
      reserve: { accountKind: "SPAREN", sollCents: 433000, earmarkedCents: 0 },
      emergencyTargetCents: 300000,
      freizeitFreeCents: 203000,
    });
    expect(transfers[0]).toMatchObject({ from: "NOTGROSCHEN", to: "FIXKOSTEN", amountCents: 6500 });
    expect(transfers.find((t) => t.from === "FREIZEIT")).toMatchObject({ to: "SPAREN", amountCents: 203000 });
    expect(uncovered).toHaveLength(1);
    expect(uncovered[0].to).toBe("SPAREN");
  });
  it("keine Vorschläge, wenn alles passt", () => {
    const r = rebalance({
      balances: { FIXKOSTEN: 100000, SPAREN: 50000, NOTGROSCHEN: 100000, FREIZEIT: 1000 },
      fixSurplusCents: 20000,
      reserve: { accountKind: "SPAREN", sollCents: 30000, earmarkedCents: 0 },
      emergencyTargetCents: 300000,
      freizeitFreeCents: 0,
    });
    expect(r.transfers).toHaveLength(0);
    expect(r.uncovered).toHaveLength(0);
  });
});

describe("Daueraufträge und Checkliste", () => {
  it("erkennt Abweichungen und gültig-ab-Datum", () => {
    const rec = { SPAREN: 14000, NOTGROSCHEN: 14000, FREIZEIT: 32075 };
    expect(ordersDiff(null, rec)).toHaveLength(3);
    expect(ordersDiff({ SPAREN: 14000, NOTGROSCHEN: 14000, FREIZEIT: 32000 }, rec)).toHaveLength(0); // unter 1 € Abweichung
    expect(ordersDiff({ SPAREN: 10000, NOTGROSCHEN: 14000, FREIZEIT: 32075 }, rec)).toEqual([{ kind: "SPAREN", fromCents: 10000, toCents: 14000 }]);
    expect(ordersValidFrom(d(2026, 11, 18)).getDate()).toBe(1);
    expect(ordersValidFrom(d(2026, 12, 5)).getFullYear()).toBe(2027);
    expect(parseOrders("{kaputt")).toBeNull();
  });
  it("sortiert Aufgaben nach Dringlichkeit", () => {
    const names = { FIXKOSTEN: "Fix", SPAREN: "Spar", NOTGROSCHEN: "Not", FREIZEIT: "Frei" };
    const todos = buildTodos({
      ausgleich: ausgleich(5000, "2026-12-03", 10000),
      transfers: [],
      uncovered: [],
      ordersDiff: [{ kind: "SPAREN", fromCents: 100, toCents: 200 }],
      hasConfirmedOrders: true,
      staleAccounts: [{ kind: "FREIZEIT", name: "Frei", days: 40 }],
      reserveUnderplanned: true,
      dueSoon: [],
      names,
      fmt: (c) => `${c / 100} €`,
      fmtDate: (x) => String(x),
    });
    expect(todos[0].kind).toBe("ausgleich");
    expect(todos.at(-1)!.kind).toBe("balance");
    expect(todos.map((t) => t.kind)).toEqual(["ausgleich", "orders", "reserve", "balance"]);
  });
  it("addMonths bleibt im richtigen Monat", () => {
    expect(addMonths(d(2026, 1, 15), 12).getMonth()).toBe(0);
  });
});
