import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { can, ensureAccessSetup } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { PERMISSIONS, PERMISSION_KEYS, isFunctionSetKey, isPermissionKey } from "@/lib/access/catalog";
import { createPermissionSet } from "@/actions/admin";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Card, PageHeader } from "@/components/ui";
import { Badge } from "../shared";

export const metadata = { title: "Admin · Berechtigungssätze" };

type SetRow = Awaited<ReturnType<typeof loadSets>>[number];
const loadSets = () =>
  prisma.permissionSet.findMany({
    orderBy: { name: "asc" },
    include: { permissions: true, setGroups: { include: { setGroup: true } }, _count: { select: { users: true, plans: true, groups: true } } },
  });

export default async function PermissionSetsPage() {
  await ensureAccessSetup();
  const me = await requireUser();
  const [sets, canEdit] = await Promise.all([loadSets(), can(me.id, "admin.access_control")]);
  // Funktionssätze in Katalog-Reihenfolge, eigene Sätze alphabetisch
  const fnSets = sets.filter((s) => isFunctionSetKey(s.key)).sort((a, b) => PERMISSION_KEYS.indexOf(a.key as never) - PERMISSION_KEYS.indexOf(b.key as never));
  const customSets = sets.filter((s) => !isFunctionSetKey(s.key));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Berechtigungssätze"
        subtitle="Jede Funktion hat ihren eigenen Satz. Zusammengehörige Sätze bündelst du in Satzgruppen. Ohne passenden Satz bleibt eine Funktion gesperrt."
      />
      <Card title="Funktionen" subtitle="Ein Satz pro Funktion, automatisch angelegt. Neue Funktionen erscheinen hier, sind aber erst freigeschaltet, wenn du sie zuweist.">
        <SetList sets={fnSets} />
      </Card>

      <Card title="Eigene Sätze" subtitle="Optional: Sätze mit mehreren Berechtigungen. Meist sind Satzgruppen übersichtlicher.">
        {customSets.length ? <SetList sets={customSets} /> : <p className="text-sm text-muted">Keine.</p>}
        {canEdit && (
          <ActionForm action={createPermissionSet} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
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
        )}
      </Card>
    </div>
  );
}

function SetList({ sets }: { sets: SetRow[] }) {
  return (
    <ul className="divide-y divide-line">
      {sets.map((s) => {
        const fn = isFunctionSetKey(s.key) ? PERMISSIONS[s.key] : null;
        const direct = s._count.plans + s._count.groups + s._count.users;
        return (
          <li key={s.id}>
            <Link href={`/admin/berechtigungen/${s.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-surface-2">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5 font-bold">
                  {s.name}
                  {fn && <Badge>{fn.category}</Badge>}
                </span>
                <span className="block truncate text-xs text-muted">
                  {fn
                    ? fn.description
                    : s.permissions.filter((p) => isPermissionKey(p.permissionKey)).map((p) => PERMISSIONS[p.permissionKey as keyof typeof PERMISSIONS].label).join(", ") || "Keine Berechtigungen"}
                </span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {s.setGroups.map((g) => (
                    <Badge key={g.setGroupId} tone="accent">{g.setGroup.name}</Badge>
                  ))}
                  {direct > 0 && <Badge>{direct}× einzeln zugewiesen</Badge>}
                  {s.setGroups.length === 0 && direct === 0 && <Badge tone="warn">nirgends zugewiesen</Badge>}
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-subtle" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
