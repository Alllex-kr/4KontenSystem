import { requireUser } from "@/lib/auth";
import { getAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { loadAccountsLite, loadOverview } from "@/lib/data";
import { ACCOUNT_KINDS, CATEGORY_COLORS, type AccountKind } from "@/lib/constants";
import { forecastFixkosten, projectBalances } from "@/lib/finance";
import { formatDate } from "@/lib/format";
import { parseLayout } from "@/lib/dashboard";
import { DashboardClient, type DashboardData } from "./DashboardClient";
import { loadPlanning } from "@/lib/planningData";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ willkommen?: string }> }) {
  const user = await requireUser();
  const { willkommen } = await searchParams;
  const overview = await loadOverview(user.id);
  const { accounts, colors, names, payments, paymentLikes, settings, balances, summary, allocation } = overview;
  const planning = await loadPlanning(user.id, overview);
  const accountsLite = await loadAccountsLite(user.id);
  const access = await getAccess(user.id);
  const canGoals = access.permissions.has("goals.use");
  const canCustomize = access.permissions.has("customize.use");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const [txs, goals] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: user.id, date: { gte: sixMonthsAgo } },
      include: { account: { select: { kind: true, name: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    canGoals ? prisma.savingsGoal.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
  ]);

  const isEmpty = payments.length === 0 && txs.length === 0;
  const total = Object.values(balances).reduce((s, v) => s + v, 0);

  const freizeitSpent = -txs
    .filter((t) => t.account.kind === "FREIZEIT" && t.date >= monthStart && t.amountCents < 0 && !t.transferGroup)
    .reduce((s, t) => s + t.amountCents, 0);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate() + 1;

  const forecast = forecastFixkosten(balances.FIXKOSTEN, now, 60, paymentLikes, allocation, settings.transferDay);

  const byCat = new Map<string, number>();
  for (const t of txs) {
    if (t.date < monthStart || t.amountCents >= 0 || t.transferGroup) continue;
    byCat.set(t.category, (byCat.get(t.category) ?? 0) - t.amountCents);
  }

  const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));
  const cashflow = months.map((m) => {
    const inMonth = txs.filter((t) => !t.transferGroup && t.date.getFullYear() === m.getFullYear() && t.date.getMonth() === m.getMonth());
    return {
      label: m.toLocaleDateString("de-DE", { month: "short" }),
      Ausgaben: -inMonth.filter((t) => t.amountCents < 0).reduce((s, t) => s + t.amountCents, 0) / 100,
      Einnahmen: inMonth.filter((t) => t.amountCents > 0).reduce((s, t) => s + t.amountCents, 0) / 100,
    };
  });

  // Daueraufträge je Konto (Rücklagen sind im Auftrag aufs Rücklagen-Konto enthalten)
  const monthly: Record<AccountKind, number> = {
    FIXKOSTEN: allocation.fixkostenCents,
    SPAREN: allocation.orders.SPAREN,
    NOTGROSCHEN: allocation.orders.NOTGROSCHEN,
    FREIZEIT: allocation.orders.FREIZEIT,
  };
  const projection = projectBalances(balances, allocation, 12, now);

  const data: DashboardData = {
    firstName: user.name.split(" ")[0],
    today: formatDate(now),
    hour: now.getHours(),
    isEmpty,
    showWelcome: Boolean(willkommen),
    total,
    incomeCents: summary.incomeCents,
    fixedTotalCents: summary.fixedTotalCents,
    freizeitBudget: allocation.freizeitCents,
    freizeitSpent,
    daysLeft,
    daysInMonth,
    savingsCents: allocation.sparenCents + allocation.notgroschenCents,
    minBufferCents: settings.minBufferCents,
    transferDay: settings.transferDay,
    warnings: allocation.warnings,
    bufferWarning:
      paymentLikes.length > 0 && forecast.minBalanceCents < settings.minBufferCents
        ? { date: formatDate(forecast.minDate), cents: forecast.minBalanceCents }
        : null,
    emergency: {
      targetCents: allocation.emergencyTargetCents,
      reached: allocation.emergencyReached,
      monthsTo:
        !allocation.emergencyReached && allocation.notgroschenCents > 0
          ? Math.ceil((allocation.emergencyTargetCents - balances.NOTGROSCHEN) / allocation.notgroschenCents)
          : null,
    },
    sparenIn12Cents: Math.round(projection.at(-1)!.SPAREN * 100),
    accounts: accounts.map((a) => ({ id: a.id, kind: a.kind as AccountKind, name: a.name, color: a.color, balanceCents: a.balanceCents, monthlyCents: monthly[a.kind as AccountKind] })),
    colors,
    names,
    forecast: forecast.points.map((p) => ({ label: p.label, balance: p.balanceCents / 100 })),
    projection: projection as unknown as Record<string, number | string>[],
    cashflow,
    categories: [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([name, v], i) => ({ name, value: v / 100, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] })),
    goals: goals.map((g) => ({ id: g.id, name: g.name, savedCents: g.savedCents, targetCents: g.targetCents })),
    recent: txs.slice(0, 8).map((t) => ({
      id: t.id,
      description: t.description,
      date: formatDate(t.date),
      accountName: t.account.name,
      accountKind: t.account.kind as AccountKind,
      category: t.category,
      amountCents: t.amountCents,
    })),
    kinds: [...ACCOUNT_KINDS],
    reserveCents: allocation.reserveCents,
    reserveAccountKind: allocation.reserveAccountKind,
    todos: planning.todos,
    transfersSuggested: planning.transfers,
    uncovered: planning.uncovered,
    ausgleich: planning.ausgleich,
    suggestedSource: planning.transfers.find((t) => t.to === "FIXKOSTEN")?.from ?? null,
    accountInfo: Object.fromEntries(accounts.map((a) => [a.kind, { name: a.name, color: a.color, balanceCents: a.balanceCents }])) as DashboardData["accountInfo"],
  };

  return <DashboardClient
      data={data}
      initialLayout={parseLayout(settings.dashboardLayout)}
      accounts={accountsLite}
      canCustomize={canCustomize}
      exclude={canGoals ? [] : ["goals"]}
    />;
}
