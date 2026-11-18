import { requireUser } from "@/lib/auth";
import { loadOverview } from "@/lib/data";
import { type AccountKind } from "@/lib/constants";
import { monthlyEquivalent, occursInMonth, yearPlan } from "@/lib/finance";
import { centsToInput, formatCents, monthShort } from "@/lib/format";
import { Alert, Card, PageHeader, Stat } from "@/components/ui";
import { BarsChart, DonutChart, Legendary, ReserveChart } from "@/components/charts";
import { PaymentForm } from "./PaymentForm";
import { PaymentRow } from "./PaymentRow";
import { getT } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";

const RHYTHM: Record<number, string> = { 1: msg("monatlich"), 2: msg("alle 2 Monate"), 3: msg("vierteljährlich"), 6: msg("halbjährlich"), 12: msg("jährlich") };

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Fixe Zahlungen") };
}

export default async function ZahlungenPage() {
  const t = await getT();
  const user = await requireUser();
  const { accounts, colors, names, payments, paymentLikes, summary, balances } = await loadOverview(user.id);
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));

  const plan = yearPlan(paymentLikes);
  const active = paymentLikes.filter((p) => p.active !== false);
  const monthlyBars = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const row: Record<string, number | string> = { label: monthShort(m) };
    row.Monatlich = active.filter((p) => p.direction === "OUT" && p.intervalMonths === 1).reduce((s, p) => s + p.amountCents, 0) / 100;
    row.Unregelmäßig = active.filter((p) => p.direction === "OUT" && p.intervalMonths > 1 && occursInMonth(p, m)).reduce((s, p) => s + p.amountCents, 0) / 100;
    row.Einnahmen = active.filter((p) => p.direction === "IN" && occursInMonth(p, m)).reduce((s, p) => s + p.amountCents, 0) / 100;
    return row;
  });

  const byCategory = new Map<string, number>();
  for (const p of active) if (p.direction === "OUT") byCategory.set(p.category ?? "Sonstiges", (byCategory.get(p.category ?? "Sonstiges") ?? 0) + monthlyEquivalent(p));
  const palette = ["#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#84cc16", "#ec4899", "#f97316", "#6366f1"];
  const catSlices = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([name, v], i) => ({ name: t(name), value: v / 100, color: palette[i % palette.length] }));

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
                {names[p.account.kind as AccountKind]} · {t(p.category)} · {t("am {day}.", { day: p.dayOfMonth })} · {RHYTHM[p.intervalMonths] ? t(RHYTHM[p.intervalMonths]) : t("alle {intervalMonths} Monate", { intervalMonths: p.intervalMonths })}
                {p.intervalMonths > 1 && " " + t("ab {month}", { month: monthShort(p.startMonth) })}
              </p>
            </div>
            <div className="text-right">
              <p className={`tabular font-bold ${p.direction === "IN" ? "text-good" : ""}`}>{formatCents(p.amountCents)}</p>
              {p.intervalMonths > 1 && <p className="tabular text-xs text-muted">≙ {formatCents(monthlyEquivalent(p))}{" "}{t("/ Monat")}</p>}
            </div>
          </div>
        }
      />
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Fixe Zahlungen")}
        subtitle={t("Einnahmen und wiederkehrende Ausgaben. Unregelmäßige Kosten wie Semesterbeitrag oder Versicherungen werden automatisch auf Monatsraten umgerechnet.")}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("Einnahmen / Monat")} cents={summary.incomeCents} tone="good" />
        <Stat label={t("Monatliche Fixkosten")} cents={summary.fixedMonthlyCents} />
        <Stat label={t("Rücklage unregelmäßig / Monat")} cents={summary.irregularMonthlyCents} hint={t("wird auf dem Fixkostenkonto angespart")} />
        <Stat label={t("Benötigter Startpuffer")} cents={plan.requiredStartCents} hint={t("damit die Rücklage im Jahresverlauf nie ins Minus rutscht") + (plan.roundingPerYearCents ? t(" · Rundung: {amount} / Jahr", { amount: `${plan.roundingPerYearCents > 0 ? "+" : ""}${formatCents(plan.roundingPerYearCents)}` }) : "")} tone={reserveShortfall ? "bad" : "default"} />
      </div>

      {reserveShortfall && (
        <Alert>
          {t("Auf deinem Fixkostenkonto liegen {balance}. Damit alle unregelmäßigen Zahlungen im Jahr gedeckt sind, brauchst du zusätzlich zum Mindestpuffer etwa {amount} Startguthaben.", { balance: formatCents(balances.FIXKOSTEN), amount: formatCents(plan.requiredStartCents) })}
        </Alert>
      )}

      <Card title={t("Neue Zahlung")} subtitle={t("Zum Beispiel Miete, Handyvertrag, BAföG oder Semesterbeitrag")}>
        <PaymentForm accounts={accountOptions} />
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={t("Einnahmen ({length})", { length: incomes.length })}>
          {incomes.length ? <ul className="stagger divide-y divide-line text-sm">{incomes.map(row)}</ul> : <p className="text-sm text-muted">{t("Noch keine Einnahmen eingetragen.")}</p>}
        </Card>
        <Card title={t("Ausgaben ({length})", { length: outgoing.length })}>
          {outgoing.length ? <ul className="stagger divide-y divide-line text-sm">{outgoing.map(row)}</ul> : <p className="text-sm text-muted">{t("Noch keine Ausgaben eingetragen.")}</p>}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title={t("Zahlungen im Jahresverlauf")} subtitle={t("Wann welche Beträge fällig sind")} className="xl:col-span-2">
          <BarsChart
            data={monthlyBars}
            stacked
            series={[
              { key: "Monatlich", name: t("Monatliche Fixkosten"), color: "#3b82f6" },
              { key: "Unregelmäßig", name: t("Unregelmäßige Zahlungen"), color: "#f59e0b" },
            ]}
          />
        </Card>
        <Card title={t("Kosten nach Kategorie")} subtitle={t("Monatlicher Anteil")}>
          <DonutChart data={catSlices} />
          <Legendary data={catSlices.slice(0, 6)} />
        </Card>
      </div>

      <Card title={t("Rücklage für unregelmäßige Zahlungen")} subtitle={t("Monatlich wird die Rate angespart, bei Fälligkeit wird der volle Betrag fällig. Startwert: benötigter Startpuffer.")}>
        <ReserveChart data={plan.rows.map((r) => ({ label: monthShort(r.month), reserve: r.reserveCents / 100, due: r.irregularDueCents / 100 }))} />
      </Card>
    </div>
  );
}
