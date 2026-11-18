import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2, UserMinus } from "lucide-react";
import { prisma } from "@/lib/db";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { addGroupMember, deleteGroup, removeGroupMember, saveGroup } from "@/actions/admin";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Card, PageHeader } from "@/components/ui";
import { ExtraSets, SetGroupChecklist } from "../../shared";

export const metadata = { title: "Admin · Personengruppe" };

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser();
  const [group, sets, setGroups, canEdit, canManageUsers] = await Promise.all([
    prisma.userGroup.findUnique({
      where: { id },
      include: { sets: true, setGroups: true, members: { orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, name: true, email: true } } } } },
    }),
    prisma.permissionSet.findMany({ orderBy: { name: "asc" }, include: { permissions: true } }),
    prisma.permissionSetGroup.findMany({ orderBy: { name: "asc" }, include: { sets: { include: { set: true } } } }),
    can(me.id, "admin.access_control"),
    can(me.id, "admin.users"),
  ]);
  if (!group) notFound();

  return (
    <div className="space-y-5">
      <Link href="/admin/gruppen" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> Alle Personengruppen
      </Link>
      <PageHeader title={group.name} subtitle={group.description || undefined} />

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <Card title="Einstellungen">
          <ActionForm action={saveGroup} resetOnSuccess={false} className="space-y-4">
            <input type="hidden" name="id" value={group.id} />
            <fieldset disabled={!canEdit} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="name">Name</label>
                  <input id="name" name="name" defaultValue={group.name} required minLength={2} maxLength={60} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="description">Beschreibung</label>
                  <input id="description" name="description" defaultValue={group.description} maxLength={300} className="input" />
                </div>
              </div>
              <div>
                <p className="label">Satzgruppen für alle Mitglieder</p>
                <SetGroupChecklist setGroups={setGroups} selected={new Set(group.setGroups.map((g) => g.setGroupId))} />
              </div>
              <div>
                <ExtraSets sets={sets} selected={new Set(group.sets.map((s) => s.setId))} />
              </div>
            </fieldset>
            {canEdit && <SubmitButton>Speichern</SubmitButton>}
          </ActionForm>
        </Card>

        <div className="space-y-5">
          <Card title={`Mitglieder (${group.members.length})`}>
            {canManageUsers && (
              <ActionForm action={addGroupMember} className="mb-4 flex gap-2">
                <input type="hidden" name="groupId" value={group.id} />
                <input name="email" type="email" required placeholder="E-Mail hinzufügen" className="input" aria-label="E-Mail des Nutzers" />
                <SubmitButton className="btn-ghost">Hinzu</SubmitButton>
              </ActionForm>
            )}
            {group.members.length === 0 ? (
              <p className="text-sm text-muted">Noch niemand.</p>
            ) : (
              <ul className="divide-y divide-line">
                {group.members.map((m) => (
                  <li key={m.userId} className="flex items-center gap-2 py-2">
                    <Link href={`/admin/nutzer/${m.userId}`} className="min-w-0 flex-1 hover:text-accent">
                      <span className="block truncate text-sm font-bold">{m.user.name}</span>
                      <span className="block truncate text-xs text-muted">{m.user.email}</span>
                    </Link>
                    {canManageUsers && (
                      <ActionForm action={removeGroupMember}>
                        <input type="hidden" name="groupId" value={group.id} />
                        <input type="hidden" name="userId" value={m.userId} />
                        <button className="icon-btn hover:bg-bad/10 hover:text-bad" aria-label={`${m.user.name} entfernen`}>
                          <UserMinus size={16} />
                        </button>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {canEdit && (
            <Card title="Löschen">
              <p className="mb-3 text-sm text-muted">Die Mitglieder verlieren die Berechtigungen aus dieser Personengruppe. Ihre Konten bleiben.</p>
              <ActionForm action={deleteGroup}>
                <input type="hidden" name="id" value={group.id} />
                <SubmitButton className="btn-ghost w-full text-bad hover:bg-bad/10">
                  <Trash2 size={16} /> Personengruppe löschen
                </SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
