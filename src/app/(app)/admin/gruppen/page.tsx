import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { createGroup } from "@/actions/admin";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { Badge } from "../shared";

export const metadata = { title: "Admin · Personengruppen" };

export default async function GroupsPage() {
  const me = await requireUser();
  const [groups, canEdit] = await Promise.all([
    prisma.userGroup.findMany({ orderBy: { name: "asc" }, include: { sets: { include: { set: true } }, setGroups: { include: { setGroup: true } }, _count: { select: { members: true } } } }),
    can(me.id, "admin.access_control"),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Personengruppen"
        subtitle="Gruppen von Menschen wie „Beta-Tester“ oder „Freunde & Familie“. Alle Mitglieder bekommen die Satzgruppen der Personengruppe, zusätzlich zu ihrem Abo."
      />
      <Card>
        {groups.length === 0 ? (
          <EmptyState title="Noch keine Personengruppen" text="Leg unten eine an, zum Beispiel für Leute, die neue Funktionen früher testen dürfen." />
        ) : (
          <ul className="divide-y divide-line">
            {groups.map((g) => (
              <li key={g.id}>
                <Link href={`/admin/gruppen/${g.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{g.name}</span>
                    {g.description && <span className="block truncate text-xs text-muted">{g.description}</span>}
                    <span className="mt-1 flex flex-wrap gap-1">
                      <Badge>{g._count.members} Mitglieder</Badge>
                      {g.setGroups.map((s) => (
                        <Badge key={s.setGroupId} tone="accent">{s.setGroup.name}</Badge>
                      ))}
                      {g.sets.map((s) => (
                        <Badge key={s.setId}>{s.set.name}</Badge>
                      ))}
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canEdit && (
        <Card title="Neue Personengruppe">
          <ActionForm action={createGroup} className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
            <div>
              <label className="label" htmlFor="name">Name</label>
              <input id="name" name="name" required minLength={2} maxLength={60} className="input" placeholder="Beta-Tester" />
            </div>
            <div>
              <label className="label" htmlFor="description">Beschreibung</label>
              <input id="description" name="description" maxLength={300} className="input" />
            </div>
            <SubmitButton>Anlegen</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
