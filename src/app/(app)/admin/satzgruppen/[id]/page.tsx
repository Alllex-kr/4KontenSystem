import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Trash2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { LOCKED_SET_GROUP_KEYS } from "@/lib/access/catalog";
import { deleteSetGroup, saveSetGroup } from "@/actions/admin";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Card, PageHeader } from "@/components/ui";
import { SetChecklist, UsedBy } from "../../shared";

export const metadata = { title: "Admin · Satzgruppe" };

export default async function SetGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser();
  const [group, sets, canEdit] = await Promise.all([
    prisma.permissionSetGroup.findUnique({
      where: { id },
      include: {
        sets: true,
        plans: { include: { plan: true } },
        userGroups: { include: { group: true } },
        users: { include: { user: { select: { id: true, name: true } } } },
      },
    }),
    prisma.permissionSet.findMany({ orderBy: { name: "asc" }, include: { permissions: true } }),
    can(me.id, "admin.access_control"),
  ]);
  if (!group) notFound();
  const locked = group.key != null && LOCKED_SET_GROUP_KEYS.includes(group.key);

  return (
    <div className="space-y-5">
      <Link href="/admin/satzgruppen" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> Alle Satzgruppen
      </Link>
      <PageHeader title={group.name} subtitle={group.description || undefined} />

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <Card title="Enthaltene Berechtigungssätze">
          {locked && (
            <p className="mb-4 flex gap-2 rounded-xl bg-surface-2 p-3 text-sm text-muted">
              <Lock size={16} className="mt-0.5 shrink-0" /> Geschützte Satzgruppe: Sie enthält immer alle Admin-Sätze und lässt sich nicht löschen.
            </p>
          )}
          <ActionForm action={saveSetGroup} resetOnSuccess={false} className="space-y-5">
            <input type="hidden" name="id" value={group.id} />
            <fieldset disabled={!canEdit} className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="name">Name</label>
                  <input id="name" name="name" defaultValue={group.name} required minLength={2} maxLength={60} readOnly={locked} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="description">Beschreibung</label>
                  <input id="description" name="description" defaultValue={group.description} maxLength={300} className="input" />
                </div>
              </div>
              <fieldset disabled={locked}>
                <SetChecklist sets={sets} selected={new Set(group.sets.map((s) => s.setId))} />
              </fieldset>
            </fieldset>
            {canEdit && <SubmitButton>Speichern</SubmitButton>}
          </ActionForm>
        </Card>

        <div className="space-y-5">
          <Card title="Wird genutzt von">
            <div className="space-y-3 text-sm">
              <UsedBy label="Abos" items={group.plans.map((p) => ({ key: p.planId, label: p.plan.name, href: "/admin/abos" }))} />
              <UsedBy label="Personengruppen" items={group.userGroups.map((g) => ({ key: g.groupId, label: g.group.name, href: `/admin/gruppen/${g.groupId}` }))} />
              <UsedBy label="Direkt" items={group.users.map((u) => ({ key: u.userId, label: u.user.name, href: `/admin/nutzer/${u.userId}` }))} />
            </div>
          </Card>
          {canEdit && !locked && (
            <Card title="Löschen">
              <p className="mb-3 text-sm text-muted">Alle Abos, Personengruppen und Personen verlieren die Berechtigungen aus dieser Satzgruppe. Die Sätze selbst bleiben.</p>
              <ActionForm action={deleteSetGroup}>
                <input type="hidden" name="id" value={group.id} />
                <SubmitButton className="btn-ghost w-full text-bad hover:bg-bad/10">
                  <Trash2 size={16} /> Satzgruppe löschen
                </SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
