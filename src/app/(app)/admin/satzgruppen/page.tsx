import Link from "next/link";
import { ChevronRight, Lock } from "lucide-react";
import { prisma } from "@/lib/db";
import { can, ensureAccessSetup } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { LOCKED_SET_GROUP_KEYS } from "@/lib/access/catalog";
import { createSetGroup } from "@/actions/admin";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Card, PageHeader } from "@/components/ui";
import { Badge } from "../shared";

export const metadata = { title: "Admin · Satzgruppen" };

export default async function SetGroupsPage() {
  await ensureAccessSetup();
  const me = await requireUser();
  const [groups, canEdit] = await Promise.all([
    prisma.permissionSetGroup.findMany({
      orderBy: { name: "asc" },
      include: { sets: { include: { set: true } }, _count: { select: { plans: true, userGroups: true, users: true } } },
    }),
    can(me.id, "admin.access_control"),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Satzgruppen"
        subtitle="Eine Satzgruppe bündelt Berechtigungssätze, die zusammengehören, zum Beispiel „Planung“ = Rücklagen + Sparziele. Abos, Personengruppen und einzelne Personen bekommen am besten Satzgruppen."
      />
      <Card>
        <ul className="divide-y divide-line">
          {groups.map((g) => (
            <li key={g.id}>
              <Link href={`/admin/satzgruppen/${g.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 font-bold">
                    {g.name}
                    {g.key && LOCKED_SET_GROUP_KEYS.includes(g.key) ? (
                      <Badge>
                        <Lock size={10} /> geschützt
                      </Badge>
                    ) : g.key ? (
                      <Badge>System</Badge>
                    ) : null}
                  </span>
                  {g.description && <span className="block truncate text-xs text-muted">{g.description}</span>}
                  <span className="mt-1 flex flex-wrap gap-1">
                    {g.sets.map((s) => (
                      <Badge key={s.setId} tone="accent">{s.set.name}</Badge>
                    ))}
                    {g.sets.length === 0 && <Badge tone="warn">leer</Badge>}
                  </span>
                  <span className="mt-1 block text-[11px] text-subtle">
                    {g._count.plans} Abos · {g._count.userGroups} Personengruppen · {g._count.users} direkt
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {canEdit && (
        <Card title="Neue Satzgruppe" subtitle="Zum Beispiel „Beta-Funktionen“, um mehrere neue Funktionen gemeinsam freizuschalten.">
          <ActionForm action={createSetGroup} className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
            <div>
              <label className="label" htmlFor="name">Name</label>
              <input id="name" name="name" required minLength={2} maxLength={60} className="input" />
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
