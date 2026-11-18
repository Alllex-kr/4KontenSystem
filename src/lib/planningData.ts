import { prisma } from "./db";
import { loadOverview } from "./data";
import { ACCOUNT_KINDS, type AccountKind } from "./constants";
import { forecastFixkosten } from "./finance";
import { formatCents, formatDate } from "./format";
import { ausgleich, buildTodos, ordersDiff, parseOrders, rebalance, reserveSummary } from "./planning";
import { getT } from "./i18n/server";

/** Lädt alles für Rücklagen, Ausgleich, notwendige Überweisungen und die Checkliste. */
export async function loadPlanning(userId: string, overview?: Awaited<ReturnType<typeof loadOverview>>) {
  const ov = overview ?? (await loadOverview(userId));
  const { accounts, names, paymentLikes, settings, balances, allocation } = ov;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [items, goals, freizeitTx] = await Promise.all([
    prisma.reserveItem.findMany({ where: { userId }, include: { purchases: { orderBy: { date: "asc" } } }, orderBy: { createdAt: "asc" } }),
    prisma.savingsGoal.findMany({ where: { userId }, select: { savedCents: true } }),
    prisma.transaction.findMany({
      where: { userId, account: { kind: "FREIZEIT" }, date: { gte: monthStart }, amountCents: { lt: 0 }, transferGroup: null },
      select: { amountCents: true },
    }),
  ]);

  const reserve = reserveSummary(items, settings, now);
  const forecast = forecastFixkosten(balances.FIXKOSTEN, now, 60, paymentLikes, allocation, settings.transferDay);
  const aus = ausgleich(forecast.minBalanceCents, forecast.minDate, settings.minBufferCents);

  const reserveKind = allocation.reserveAccountKind;
  const earmarked = reserveKind === "SPAREN" ? goals.reduce((s, g) => s + g.savedCents, 0) : Math.min(balances.NOTGROSCHEN, allocation.emergencyTargetCents);
  const freizeitSpent = -freizeitTx.reduce((s, t) => s + t.amountCents, 0);
  const freizeitRemainingBudget = Math.max(0, allocation.freizeitCents - freizeitSpent);
  const reb = rebalance({
    balances,
    fixSurplusCents: forecast.minBalanceCents - settings.minBufferCents,
    reserve: { accountKind: reserveKind, sollCents: reserve.sollBalanceCents, earmarkedCents: earmarked },
    emergencyTargetCents: allocation.emergencyTargetCents,
    freizeitFreeCents: balances.FREIZEIT - freizeitRemainingBudget,
  });

  const confirmed = parseOrders(settings.confirmedOrders);
  const diff = paymentLikes.length ? ordersDiff(confirmed, allocation.orders) : [];
  const staleAccounts = accounts
    .map((a) => ({ kind: a.kind as AccountKind, name: a.name, days: a.balanceUpdatedAt ? Math.floor((now.getTime() - a.balanceUpdatedAt.getTime()) / 86_400_000) : null }))
    .filter((a) => a.days === null || a.days > 30);

  const todos = buildTodos({
    ausgleich: aus,
    transfers: reb.transfers,
    uncovered: reb.uncovered,
    ordersDiff: diff,
    hasConfirmedOrders: Boolean(confirmed),
    staleAccounts: paymentLikes.length ? staleAccounts : [],
    reserveUnderplanned: reserve.underplanned,
    dueSoon: reserve.dueSoon,
    names,
    fmt: formatCents,
    fmtDate: formatDate,
    t: await getT(),
  });

  return {
    overview: ov,
    items,
    reserve,
    ausgleich: aus,
    transfers: reb.transfers,
    uncovered: reb.uncovered,
    confirmedOrders: confirmed,
    ordersValidFrom: settings.ordersValidFrom,
    ordersDiff: diff,
    todos,
    reserveEarmarkedCents: earmarked,
    kinds: ACCOUNT_KINDS,
  };
}
