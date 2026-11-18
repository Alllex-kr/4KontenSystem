import Link from "next/link";
import { ChevronRight, Search, ShieldCheck } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureAccessSetup, isEnvAdmin } from "@/lib/access";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { Badge, ONLINE_MS, OnlineDot, relativeTime } from "./shared";

export const metadata = { title: "Admin · Nutzer" };

const FILTERS = [
  { key: "", label: "Alle" },
  { key: "online", label: "Gerade aktiv" },
  { key: "angemeldet", label: "Angemeldet" },
  { key: "gesperrt", label: "Gesperrt" },
] as const;

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; abo?: string }> }) {
  await ensureAccessSetup();
  const { q = "", filter = "", abo = "" } = await searchParams;
  const now = new Date();
  const onlineSince = new Date(now.getTime() - ONLINE_MS);

  const where: Prisma.UserWhereInput = {
    ...(q.trim() ? { OR: [{ name: { contains: q.trim() } }, { email: { contains: q.trim().toLowerCase() } }] } : {}),
    ...(filter === "online" ? { lastSeenAt: { gte: onlineSince }, disabledAt: null } : {}),
    ...(filter === "angemeldet" ? { sessions: { some: { expiresAt: { gt: now } } }, disabledAt: null } : {}),
    ...(filter === "gesperrt" ? { disabledAt: { not: null } } : {}),
  };

  const [plans, users, total, online, signedIn] = await Promise.all([
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { users: true } } } }),
    prisma.user.findMany({
      where,
      orderBy: [{ lastSeenAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        lastSeenAt: true,
        disabledAt: true,
        planId: true,
        _count: { select: { sessions: { where: { expiresAt: { gt: now } } }, permissionSets: true, groups: true } },
      },
    }),
    prisma.user.count(),
    prisma.user.count({ where: { lastSeenAt: { gte: onlineSince }, disabledAt: null } }),
    prisma.user.count({ where: { sessions: { some: { expiresAt: { gt: now } } }, disabledAt: null } }),
  ]);
  const defaultPlan = plans.find((p) => p.isDefault);
  const planOf = (planId: string | null) => plans.find((p) => p.id === planId) ?? defaultPlan;
  const usersWithoutPlan = await prisma.user.count({ where: { planId: null } });
  const shown = abo ? users.filter((u) => planOf(u.planId)?.key === abo) : users;

  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ q, filter, abo, ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    const s = p.toString();
    return s ? `/admin?${s}` : "/admin";
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Nutzer" subtitle="Alle Konten mit Abo, Gruppen und Berechtigungen. Tipp auf einen Nutzer, um Rechte zu geben oder zu entziehen." />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatTile label="Nutzer" value={total} />
        <StatTile label="Gerade aktiv" value={online} hint="letzte 5 Min." />
        <StatTile label="Angemeldet" value={signedIn} hint="gültige Sitzung" />
      </div>

      <div className="flex flex-wrap gap-2">
        {plans.map((p) => {
          const count = p._count.users + (p.isDefault ? usersWithoutPlan : 0);
          return (
            <Link key={p.id} href={href({ abo: abo === p.key ? "" : p.key })} className="chip" aria-pressed={abo === p.key}>
              {p.allAccess && <ShieldCheck size={14} />}
              {p.name} <span className="tabular opacity-70">{count}</span>
            </Link>
          );
        })}
      </div>

      <Card>
        <form className="mb-3 flex gap-2" action="/admin">
          <input type="hidden" name="filter" value={filter} />
          <input type="hidden" name="abo" value={abo} />
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle" />
            <input name="q" defaultValue={q} placeholder="Name oder E-Mail suchen" className="input pl-9" type="search" />
          </div>
          <button className="btn-ghost">Suchen</button>
        </form>
        <div className="-mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-1">
          {FILTERS.map((f) => (
            <Link key={f.key} href={href({ filter: f.key })} className="chip" aria-pressed={filter === f.key}>
              {f.label}
            </Link>
          ))}
        </div>

        {shown.length === 0 ? (
          <EmptyState title="Keine Nutzer gefunden" text="Ändere die Suche oder den Filter." />
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((u) => {
              const isOnline = !u.disabledAt && !!u.lastSeenAt && now.getTime() - u.lastSeenAt.getTime() < ONLINE_MS;
              const plan = planOf(u.planId);
              return (
                <li key={u.id}>
                  <Link href={`/admin/nutzer/${u.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-surface-2">
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft font-black text-accent">
                      {u.name.slice(0, 1).toUpperCase()}
                      <span className="absolute -right-0.5 -bottom-0.5 rounded-full border-2 border-surface">
                        <OnlineDot online={isOnline} />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate font-bold">{u.name}</span>
                        {(plan?.allAccess || isEnvAdmin(u.email)) && (
                          <Badge tone="accent" title={isEnvAdmin(u.email) ? "Über ADMIN_EMAILS in der .env" : "Abo mit Vollzugriff"}>
                            <ShieldCheck size={11} /> Admin
                          </Badge>
                        )}
                        {u.disabledAt && <Badge tone="bad">Gesperrt</Badge>}
                      </span>
                      <span className="block truncate text-xs text-muted">{u.email}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {plan && !plan.allAccess && <Badge tone={plan.isDefault ? "default" : "good"}>{plan.name}</Badge>}
                        {u._count.permissionSets > 0 && <Badge>{u._count.permissionSets} direkt</Badge>}
                        {u._count.groups > 0 && <Badge>{u._count.groups} {u._count.groups === 1 ? "Gruppe" : "Gruppen"}</Badge>}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-right text-xs text-muted sm:block">
                      <span className="block">{relativeTime(u.lastSeenAt)}</span>
                      <span className="block">{u._count.sessions ? `${u._count.sessions} Sitzung${u._count.sessions === 1 ? "" : "en"}` : "abgemeldet"}</span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-subtle" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function StatTile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="card">
      <p className="text-[11px] font-bold tracking-wide text-muted uppercase sm:text-xs">{label}</p>
      <p className="tabular mt-1 text-xl font-black sm:text-2xl">{value}</p>
      {hint && <p className="text-[11px] text-subtle">{hint}</p>}
    </div>
  );
}
