import { requireUser } from "@/lib/auth";
import { loadOverview } from "@/lib/data";
import { MONTHS_SHORT, type AccountKind } from "@/lib/constants";
import { monthlyEquivalent, occursInMonth, yearPlan } from "@/lib/finance";
import { centsToInput, formatCents } from "@/lib/format";
import { Alert, Card, PageHeader, Stat } from "@/components/ui";
import { BarsChart, DonutChart, Legendary, ReserveChart } from "@/components/charts";
import { PaymentForm } from "./PaymentForm";
import { PaymentRow } from "./PaymentRow";

const RHYTHM: Record<number, string> = { 1: "monatlich", 2: "alle 2 Monate", 3: "vierteljährlich", 6: "halbjährlich", 12: "jährlich" };

export const metadata = { title: "Fixe Zahlungen" };

export default async function ZahlungenPage() {
  const user = await requireUser();
  const { accounts, colors, names, payments, paymentLikes, summary, balances } = await loadOverview(user.id);
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));

  const plan = yearPlan(paymentLikes);
  const active = paymentLikes.filter((p) => p.active !== false);
  const monthlyBars = MONTHS_SHORT.map((label, i) => {
    const m = i + 1;
    const row: Record<string, number | string> = { label };
    row.Monatlich = active.filter((p) => p.direction === "OUT" && p.intervalMonths === 1).reduce((s, p) => s + p.amountCents, 0) / 100;
    row.Unregelmäßig = active.filter((p) => p.direction === "OUT" && p.intervalMonths > 1 && occursInMonth(p, m)).reduce((s, p) => s + p.amountCents, 0) / 100;
    row.Einnahmen = active.filter((p) => p.direction === "IN" && occursInMonth(p, m)).reduce((s, p) => s + p.amountCents, 0) / 100;
    return row;
  });

  const byCategory = new Map<string, number>();
  for (const p of active) if (p.direction === "OUT") byCategory.set(p.category ?? "Sonstiges", (byCategory.get(p.category ?? "Sonstiges") ?? 0) + monthlyEquivalent(p));
  const palette = ["#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#84cc16", "#ec4899", "#f97316", "#6366f1"];
  const catSlices = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([name, v], i) => ({ name, value: v / 100, color: palette[i % palette.length] }));

  const incomes = payments.filter((p) => p.direction === "IN");
  const outgoing = payments.filter((p) => p.direction === "OUT");
  const reserveShortfall = plan.requiredStartCents > 0 && balances.FIXKOSTEN < plan.requiredStartCents;

  const row = (p: (typeof payments)[number]) => {
    return (
      <PaymentRow
        key={p.id}
        active={p.active}
        accounts={accountOptions}
        values={{
          id: p.id, name: p.name, amount: centsToInput(p.amountCents), direction: p.direction as "IN" | "OUT", accountId: p.accountId,
          dayOfMonth: p.dayOfMonth, intervalMonths: p.intervalMonths, startMonth: p.startMonth, category: p.category,
        }}
        summary={
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <p className="truncate font-medium">{p.name}</p>
              <p className="text-xs text-muted">
                <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: colors[p.account.kind as AccountKind] }} />
                {names[p.account.kind as AccountKind]} · {p.category} · am {p.dayOfMonth}. · {RHYTHM[p.intervalMonths] ?? `alle ${p.intervalMonths} Monate`}
                {p.intervalMonths > 1 && ` ab ${MONTHS_SHORT[p.startMonth - 1]}`}
              </p>
            </div>
            <div className="text-right">
              <p className={`tabular font-bold ${p.direction === "IN" ? "text-good" : ""}`}>{formatCents(p.amountCents)}</p>
              {p.intervalMonths > 1 && <p className="tabular text-xs text-muted">≙ {formatCents(monthlyEquivalent(p))} / Monat</p>}
            </div>
          </div>
        }
      />
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fixe Zahlungen"
        subtitle="Einnahmen und wiederkehrende Ausgaben. Unregelmäßige Kosten wie Semesterbeitrag oder Versicherungen werden automatisch auf Monatsraten umgerechnet."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Einnahmen / Monat" cents={summary.incomeCents} tone="good" />
        <Stat label="Monatliche Fixkosten" cents={summary.fixedMonthlyCents} />
        <Stat label="Rücklage unregelmäßig / Monat" cents={summary.irregularMonthlyCents} hint="wird auf dem Fixkostenkonto angespart" />
        <Stat label="Benötigter Startpuffer" cents={plan.requiredStartCents} hint={`damit die Rücklage im Jahresverlauf nie ins Minus rutscht${plan.roundingPerYearCents ? ` · Rundung: ${plan.roundingPerYearCents > 0 ? "+" : ""}${formatCents(plan.roundingPerYearCents)} / Jahr` : ""}`} tone={reserveShortfall ? "bad" : "default"} />
      </div>

      {reserveShortfall && (
        <Alert>
          Auf deinem Fixkostenkonto liegen {formatCents(balances.FIXKOSTEN)}. Damit alle unregelmäßigen Zahlungen im Jahr gedeckt sind, brauchst du
          zusätzlich zum Mindestpuffer etwa {formatCents(plan.requiredStartCents)} Startguthaben.
        </Alert>
      )}

      <Card title="Neue Zahlung" subtitle="Zum Beispiel Miete, Handyvertrag, BAföG oder Semesterbeitrag">
        <PaymentForm accounts={accountOptions} />
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={`Einnahmen (${incomes.length})`}>
          {incomes.length ? <ul className="stagger divide-y divide-line text-sm">{incomes.map(row)}</ul> : <p className="text-sm text-muted">Noch keine Einnahmen eingetragen.</p>}
        </Card>
        <Card title={`Ausgaben (${outgoing.length})`}>
          {outgoing.length ? <ul className="stagger divide-y divide-line text-sm">{outgoing.map(row)}</ul> : <p className="text-sm text-muted">Noch keine Ausgaben eingetragen.</p>}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Zahlungen im Jahresverlauf" subtitle="Wann welche Beträge fällig sind" className="xl:col-span-2">
          <BarsChart
            data={monthlyBars}
            stacked
            series={[
              { key: "Monatlich", name: "Monatliche Fixkosten", color: "#3b82f6" },
              { key: "Unregelmäßig", name: "Unregelmäßige Zahlungen", color: "#f59e0b" },
            ]}
          />
        </Card>
        <Card title="Kosten nach Kategorie" subtitle="Monatlicher Anteil">
          <DonutChart data={catSlices} />
          <Legendary data={catSlices.slice(0, 6)} />
        </Card>
      </div>

      <Card title="Rücklage für unregelmäßige Zahlungen" subtitle="Monatlich wird die Rate angespart, bei Fälligkeit wird der volle Betrag fällig. Startwert: benötigter Startpuffer.">
        <ReserveChart data={plan.rows.map((r) => ({ label: MONTHS_SHORT[r.month - 1], reserve: r.reserveCents / 100, due: r.irregularDueCents / 100 }))} />
      </Card>
    </div>
  );
}
