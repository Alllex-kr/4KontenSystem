import { requireUser } from "@/lib/auth";
import { getAccess } from "@/lib/access";
import { FeatureLocked } from "@/components/FeatureLocked";
import { loadPlanning } from "@/lib/planningData";
import { PageHeader } from "@/components/ui";
import { ReserveClient, type ReserveItemView } from "./ReserveClient";

export const metadata = { title: "Rücklagen" };

export default async function RuecklagenPage() {
  const user = await requireUser();
  const access = await getAccess(user.id);
  if (!access.permissions.has("reserves.use")) return <FeatureLocked feature="reserves.use" planName={access.plan?.name} />;
  const p = await loadPlanning(user.id);
  const { settings, balances, names, colors } = p.overview;
  const kind = p.overview.allocation.reserveAccountKind;

  const items: ReserveItemView[] = p.items.map((i) => {
    const st = p.reserve.stats.get(i.id)!;
    return {
      id: i.id,
      name: i.name,
      kind: i.kind as "PLANNED" | "IRREGULAR",
      plannedIntervalMonths: i.plannedIntervalMonths,
      plannedAmountCents: i.plannedAmountCents,
      useEffective: i.useEffective,
      purchases: i.purchases.map((x) => ({ id: x.id, date: x.date.toISOString(), amountCents: x.amountCents, note: x.note })),
      stats: {
        monthlyCents: st.monthlyCents,
        intervalMonths: st.intervalMonths,
        computedIntervalMonths: st.computedIntervalMonths,
        nextDate: st.nextDate?.toISOString() ?? null,
        targetCents: st.targetCents,
        accruedCents: st.accruedCents,
        effectiveMonthlyCents: st.effectiveMonthlyCents,
        estimateMonthlyCents: st.estimateMonthlyCents,
        avgIntervalDays: st.avgIntervalDays,
        avgAmountCents: st.avgAmountCents,
      },
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rücklagen"
        subtitle="Für Ausgaben, die sicher kommen, aber nicht jeden Monat: Geschenke, Urlaub, ein neuer Laptop. Vierklee rechnet aus, wie viel du dafür monatlich zurücklegen solltest."
      />
      <ReserveClient
        items={items}
        summary={{
          forecastMonthlyCents: p.reserve.forecastMonthlyCents,
          fixedMonthlyCents: settings.reserveMonthlyCents,
          tolerancePct: settings.reserveTolerancePct,
          underplanned: p.reserve.underplanned,
          sollBalanceCents: p.reserve.sollBalanceCents,
          accountKind: kind,
          accountName: names[kind],
          accountColor: colors[kind],
          accountAvailableCents: balances[kind] - p.reserveEarmarkedCents,
          earmarkedCents: p.reserveEarmarkedCents,
          allocatedCents: p.overview.allocation.reserveCents,
        }}
        accountNames={{ SPAREN: names.SPAREN, NOTGROSCHEN: names.NOTGROSCHEN }}
      />
    </div>
  );
}
