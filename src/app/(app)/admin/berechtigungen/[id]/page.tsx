import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Trash2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { isFunctionSetKey } from "@/lib/access/catalog";
import { deletePermissionSet, savePermissionSet } from "@/actions/admin";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Card, PageHeader } from "@/components/ui";
import { PermissionChecklist, UsedBy } from "../../shared";

export const metadata = { title: "Admin · Berechtigungssatz" };

export default async function PermissionSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser();
  const [set, canEdit] = await Promise.all([
    prisma.permissionSet.findUnique({
      where: { id },
      include: {
        permissions: true,
        plans: { include: { plan: true } },
        groups: { include: { group: true } },
        users: { include: { user: { select: { id: true, name: true, email: true } } } },
        setGroups: { include: { setGroup: true } },
      },
    }),
    can(me.id, "admin.access_control"),
  ]);
  if (!set) notFound();
  const locked = isFunctionSetKey(set.key);

  return (
    <div className="space-y-5">
      <Link href="/admin/berechtigungen" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> Alle Berechtigungssätze
      </Link>
      <PageHeader title={set.name} subtitle={set.description || undefined} />

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <Card title="Berechtigungen">
          {locked && (
            <p className="mb-4 flex gap-2 rounded-xl bg-surface-2 p-3 text-sm text-muted">
              <Lock size={16} className="mt-0.5 shrink-0" /> Funktionssatz: Er enthält immer genau diese eine Funktion und lässt sich nicht löschen. Freischalten tust du ihn über eine Satzgruppe, ein Abo, eine Personengruppe oder direkt bei einer Person.
            </p>
          )}
          <ActionForm action={savePermissionSet} resetOnSuccess={false} className="space-y-5">
            <input type="hidden" name="id" value={set.id} />
            <fieldset disabled={!canEdit} className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="name">Name</label>
                  <input id="name" name="name" defaultValue={set.name} required minLength={2} maxLength={60} readOnly={locked} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="description">Beschreibung</label>
                  <input id="description" name="description" defaultValue={set.description} maxLength={300} className="input" />
                </div>
              </div>
              <PermissionChecklist selected={new Set(set.permissions.map((p) => p.permissionKey))} disabled={locked} />
            </fieldset>
            {canEdit && <SubmitButton>Speichern</SubmitButton>}
          </ActionForm>
        </Card>

        <div className="space-y-5">
          <Card title="Wird genutzt von">
            <div className="space-y-3 text-sm">
              <UsedBy label="Satzgruppen" items={set.setGroups.map((g) => ({ key: g.setGroupId, label: g.setGroup.name, href: `/admin/satzgruppen/${g.setGroupId}` }))} />
              <UsedBy label="Abos" items={set.plans.map((p) => ({ key: p.planId, label: p.plan.name, href: "/admin/abos" }))} />
              <UsedBy label="Personengruppen" items={set.groups.map((g) => ({ key: g.groupId, label: g.group.name, href: `/admin/gruppen/${g.groupId}` }))} />
              <UsedBy label="Direkt" items={set.users.map((u) => ({ key: u.userId, label: u.user.name, href: `/admin/nutzer/${u.userId}` }))} />
            </div>
          </Card>
          {canEdit && !set.key && (
            <Card title="Löschen">
              <p className="mb-3 text-sm text-muted">Alle Abos, Gruppen und Personen verlieren die Berechtigungen aus diesem Satz.</p>
              <ActionForm action={deletePermissionSet}>
                <input type="hidden" name="id" value={set.id} />
                <SubmitButton className="btn-ghost w-full text-bad hover:bg-bad/10">
                  <Trash2 size={16} /> Satz löschen
                </SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
