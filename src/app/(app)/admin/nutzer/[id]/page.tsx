import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, LogOut, ShieldCheck, ShieldOff, X } from "lucide-react";
import { prisma } from "@/lib/db";
import { can, describeSource, isEnvAdmin, loadAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { PERMISSION_KEYS, PERMISSIONS } from "@/lib/access/catalog";
import { saveUserAccess, setUserDisabled, signOutUser } from "@/actions/admin";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Card, PageHeader } from "@/components/ui";
import { formatCents } from "@/lib/format";
import { Badge, ONLINE_MS, OnlineDot, relativeTime } from "../../shared";

export const metadata = { title: "Admin · Nutzer" };

const dateInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser();
  const now = new Date();
  const [user, plans, sets, setGroups, groups, access, canManage, log] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: {
        permissionSets: true,
        oauthAccounts: { select: { provider: true } },
        setGroups: true,
        groups: true,
        _count: { select: { sessions: { where: { expiresAt: { gt: now } } } } },
      },
    }),
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.permissionSet.findMany({ orderBy: { name: "asc" }, include: { permissions: true } }),
    prisma.permissionSetGroup.findMany({ orderBy: { name: "asc" }, include: { sets: { include: { set: true } } } }),
    prisma.userGroup.findMany({ orderBy: { name: "asc" } }),
    loadAccess(id),
    can(me.id, "admin.users"),
    prisma.adminAuditLog.findMany({ where: { targetUserId: id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  if (!user) notFound();

  const isSelf = user.id === me.id;
  const envAdmin = isEnvAdmin(user.email);
  const isOnline = !user.disabledAt && !!user.lastSeenAt && now.getTime() - user.lastSeenAt.getTime() < ONLINE_MS;
  const direct = new Map(user.permissionSets.map((s) => [s.setId, s]));
  const directGroups = new Map(user.setGroups.map((g) => [g.setGroupId, g]));
  const memberOf = new Set(user.groups.map((g) => g.groupId));
  const defaultPlan = plans.find((p) => p.isDefault);

  return (
    <div className="space-y-5">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> Alle Nutzer
      </Link>
      <PageHeader title={user.name} subtitle={user.email}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={isOnline ? "good" : "default"}>
            <OnlineDot online={isOnline} /> {isOnline ? "Gerade aktiv" : `Zuletzt ${relativeTime(user.lastSeenAt)}`}
          </Badge>
          {user.disabledAt && <Badge tone="bad">Gesperrt seit {user.disabledAt.toLocaleDateString("de-DE")}</Badge>}
          {isSelf && <Badge tone="accent">Das bist du</Badge>}
        </div>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Card title="Zugriff" subtitle="Was der Nutzer darf, ergibt sich aus Abo + Gruppen + direkt zugewiesenen Sätzen.">
            <ActionForm action={saveUserAccess} resetOnSuccess={false} className="space-y-5">
              <input type="hidden" name="userId" value={user.id} />
              <fieldset disabled={!canManage} className="space-y-5">
                <div>
                  <label className="label" htmlFor="planId">Abo</label>
                  {envAdmin && <input type="hidden" name="planId" value={user.planId ?? ""} />}
                  <select id="planId" name={envAdmin ? undefined : "planId"} className="input" defaultValue={user.planId ?? ""} disabled={envAdmin}>
                    <option value="">Standard ({defaultPlan?.name ?? "keins"})</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.allAccess ? " · Vollzugriff" : p.priceCents ? ` · ${formatCents(p.priceCents)}/Monat` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted">
                    {envAdmin
                      ? "Steht in ADMIN_EMAILS (.env) und ist darum immer Administrator."
                      : "„Standard“ folgt automatisch, wenn du ein anderes Abo zum Standard machst. „Administrator“ gibt Vollzugriff auf alles."}
                  </p>
                </div>

                <div>
                  <p className="label">Personengruppen</p>
                  {groups.length === 0 ? (
                    <p className="text-sm text-muted">
                      Noch keine Personengruppen. <Link href="/admin/gruppen" className="font-bold text-accent">Personengruppe anlegen</Link>
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {groups.map((g) => (
                        <label key={g.id} className="chip cursor-pointer has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent">
                          <input type="checkbox" name="group" value={g.id} defaultChecked={memberOf.has(g.id)} className="h-4 w-4 accent-[var(--accent)]" />
                          {g.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="label">Direkt zugewiesene Satzgruppen</p>
                  <AssignmentList
                    field="setGroup"
                    expPrefix="gexp_"
                    now={now}
                    items={setGroups.map((g) => ({ id: g.id, name: g.name, detail: g.sets.map((s) => s.set.name).join(", ") || "leer" }))}
                    assigned={directGroups}
                  />
                  <p className="mt-1 text-xs text-muted">Zusätzlich zum Abo. Ohne Datum gilt die Zuweisung unbefristet.</p>
                </div>

                <details className="rounded-xl border border-line p-3" open={direct.size > 0}>
                  <summary className="cursor-pointer text-sm font-bold">
                    Einzelne Berechtigungssätze direkt {direct.size > 0 && <span className="text-accent">({direct.size})</span>}
                  </summary>
                  <p className="mt-1 mb-3 text-xs text-muted">Für Ausnahmen, z. B. eine einzelne Funktion für 30 Tage zum Testen.</p>
                  <AssignmentList
                    field="set"
                    expPrefix="exp_"
                    now={now}
                    items={sets.map((s) => ({
                      id: s.id,
                      name: s.name,
                      detail: s.permissions.map((p) => (p.permissionKey in PERMISSIONS ? PERMISSIONS[p.permissionKey as keyof typeof PERMISSIONS].label : p.permissionKey)).join(", ") || "leer",
                    }))}
                    assigned={direct}
                  />
                </details>
              </fieldset>
              {canManage ? <SubmitButton>Zugriff speichern</SubmitButton> : <p className="text-sm text-muted">Zum Ändern brauchst du „Nutzer verwalten“.</p>}
            </ActionForm>
          </Card>

          <Card title="Effektive Berechtigungen" subtitle="Ergebnis aller Zuweisungen. Was hier fehlt, ist für den Nutzer gesperrt.">
            <ul className="divide-y divide-line">
              {PERMISSION_KEYS.map((key) => {
                const sources = access.permissions.get(key);
                return (
                  <li key={key} className="flex items-start gap-3 py-2.5">
                    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${sources ? "bg-good/10 text-good" : "bg-surface-2 text-subtle"}`}>
                      {sources ? <Check size={14} strokeWidth={3} /> : <X size={14} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className={`block font-bold ${sources ? "" : "text-muted"}`}>{PERMISSIONS[key].label}</span>
                      <span className="block text-xs text-muted">{sources ? sources.map(describeSource).join(" · ") : "nicht freigeschaltet"}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Konto">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Registriert</dt>
                <dd className="font-semibold">{user.createdAt.toLocaleDateString("de-DE")}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Anmeldung</dt>
                <dd className="font-semibold">
                  {[user.passwordHash ? "Passwort" : null, user.oauthAccounts.length ? "Google" : null].filter(Boolean).join(" + ") || "–"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Aktive Sitzungen</dt>
                <dd className="tabular font-semibold">{user._count.sessions}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Abo</dt>
                <dd className="font-semibold">{access.plan ? `${access.plan.name}${access.plan.isFallback ? " (Standard)" : ""}` : "–"}</dd>
              </div>
            </dl>
            {envAdmin && (
              <p className="mt-3 flex gap-2 rounded-xl bg-accent-soft p-2.5 text-xs text-accent">
                <ShieldCheck size={15} className="shrink-0" /> Immer Administrator mit Vollzugriff über ADMIN_EMAILS in der .env.
              </p>
            )}
            {canManage && !isSelf && (
              <div className="mt-4 space-y-2 border-t border-line pt-4">
                <ActionForm action={signOutUser} resetOnSuccess={false}>
                  <input type="hidden" name="userId" value={user.id} />
                  <SubmitButton className="btn-ghost w-full">
                    <LogOut size={16} /> Überall abmelden
                  </SubmitButton>
                </ActionForm>
                <ActionForm action={setUserDisabled} resetOnSuccess={false}>
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="disable" value={user.disabledAt ? "0" : "1"} />
                  <SubmitButton className={`btn-ghost w-full ${user.disabledAt ? "" : "text-bad hover:bg-bad/10"}`}>
                    <ShieldOff size={16} /> {user.disabledAt ? "Entsperren" : "Konto sperren"}
                  </SubmitButton>
                </ActionForm>
              </div>
            )}
          </Card>

          <Card title="Verlauf">
            {log.length === 0 ? (
              <p className="text-sm text-muted">Noch keine Änderungen durch Admins.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {log.map((l) => (
                  <li key={l.id}>
                    <p className="font-semibold">{l.action}</p>
                    {l.detail && <p className="text-xs break-words text-muted">{l.detail}</p>}
                    <p className="text-[11px] text-subtle">
                      {l.actorName} · {l.createdAt.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function AssignmentList({
  field,
  expPrefix,
  items,
  assigned,
  now,
}: {
  field: string;
  expPrefix: string;
  items: { id: string; name: string; detail: string }[];
  assigned: Map<string, { expiresAt: Date | null }>;
  now: Date;
}) {
  return (
    <ul className="space-y-2">
      {items.map((it) => {
        const a = assigned.get(it.id);
        const expired = a?.expiresAt && a.expiresAt < now;
        return (
          <li key={it.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft/50">
            <label className="flex min-w-0 flex-[1_1_14rem] items-start gap-3">
              <input type="checkbox" name={field} value={it.id} defaultChecked={!!a} className="mt-0.5 h-5 w-5 accent-[var(--accent)]" />
              <span className="min-w-0 text-sm">
                <span className="block font-bold">
                  {it.name} {expired && <Badge tone="warn">abgelaufen</Badge>}
                </span>
                <span className="block text-xs text-muted">{it.detail}</span>
              </span>
            </label>
            <label className="ml-8 flex items-center gap-2 text-xs whitespace-nowrap text-muted sm:ml-0">
              gültig bis
              <input type="date" name={`${expPrefix}${it.id}`} defaultValue={dateInput(a?.expiresAt ?? null)} className="input min-h-9 w-auto py-1" aria-label={`${it.name} gültig bis`} />
            </label>
          </li>
        );
      })}
    </ul>
  );
}
