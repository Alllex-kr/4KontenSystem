import { Infinity as InfinityIcon, ShieldCheck, Trash2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { can, ensureAccessSetup } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { centsToInput } from "@/lib/format";
import { deletePlan, savePlan } from "@/actions/admin";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Card, PageHeader } from "@/components/ui";
import { PERMISSIONS, PERMISSION_KEYS } from "@/lib/access/catalog";
import { Badge, ExtraSets, SetGroupChecklist } from "../shared";

export const metadata = { title: "Admin · Abos" };

export default async function PlansPage() {
  await ensureAccessSetup();
  const me = await requireUser();
  const [plans, sets, setGroups, withoutPlan, canEdit] = await Promise.all([
    prisma.plan.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { sets: true, setGroups: true, _count: { select: { users: true } } } }),
    prisma.permissionSet.findMany({ orderBy: { name: "asc" }, include: { permissions: true } }),
    prisma.permissionSetGroup.findMany({ orderBy: { name: "asc" }, include: { sets: { include: { set: true } } } }),
    prisma.user.count({ where: { planId: null } }),
    can(me.id, "admin.access_control"),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Abos"
        subtitle="Jedes Abo enthält Satzgruppen. Wer das Abo hat, bekommt automatisch alle Funktionen daraus. Die Bezahlung ist noch nicht angebunden, der Preis ist nur zur Anzeige."
      />

      {plans.filter((p) => !p.allAccess).map((p) => {
        const count = p._count.users + (p.isDefault ? withoutPlan : 0);
        return (
          <Card
            key={p.id}
            title={p.name}
            subtitle={`Kürzel: ${p.key} · ${count} ${count === 1 ? "Nutzer" : "Nutzer"}`}
            action={p.isDefault ? <Badge tone="accent">Standard</Badge> : undefined}
          >
            <PlanForm plan={p} sets={sets} setGroups={setGroups} canEdit={canEdit} />
            {canEdit && !p.isDefault && (
              <ActionForm action={deletePlan} className="mt-3 border-t border-line pt-3">
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton className="btn-ghost text-bad hover:bg-bad/10">
                  <Trash2 size={16} /> Abo löschen
                </SubmitButton>
                <p className="mt-1 text-xs text-muted">Nutzer mit diesem Abo wechseln ins Standard-Abo.</p>
              </ActionForm>
            )}
          </Card>
        );
      })}

      {plans.filter((p) => p.allAccess).map((p) => (
        <Card
          key={p.id}
          title={p.name}
          subtitle={`${p._count.users} ${p._count.users === 1 ? "Nutzer" : "Nutzer"} · nicht buchbar`}
          action={
            <Badge tone="accent">
              <ShieldCheck size={11} /> Vollzugriff
            </Badge>
          }
          className="border-accent/40"
        >
          <p className="text-sm text-muted">{p.description}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {PERMISSION_KEYS.map((k) => (
              <Badge key={k} tone="good">{PERMISSIONS[k].label}</Badge>
            ))}
            <Badge>
              <InfinityIcon size={11} /> + alle künftigen Funktionen
            </Badge>
          </div>
          <p className="mt-3 text-xs text-muted">
            Geschützt: Inhalt, Preis und Standard lassen sich nicht ändern, löschen geht nicht. Konten aus ADMIN_EMAILS (.env) sind immer in diesem Abo.
            Weitere Admins: im Nutzer das Abo „{p.name}“ wählen.
          </p>
        </Card>
      ))}

      {canEdit && (
        <Card title="Neues Abo" subtitle="Zum Beispiel „Vierklee Pro“ mit zusätzlichen Funktionen.">
          <PlanForm sets={sets} setGroups={setGroups} canEdit />
        </Card>
      )}
    </div>
  );
}

function PlanForm({
  plan,
  sets,
  setGroups,
  canEdit,
}: {
  plan?: { id: string; key: string; name: string; description: string; priceCents: number; isDefault: boolean; sortOrder: number; sets: { setId: string }[]; setGroups: { setGroupId: string }[] };
  sets: { id: string; name: string; permissions: { permissionKey: string }[] }[];
  setGroups: { id: string; name: string; sets: { set: { name: string } }[] }[];
  canEdit: boolean;
}) {
  const p = plan?.id ?? "neu";
  return (
    <ActionForm action={savePlan} resetOnSuccess={!plan} className="space-y-4">
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <fieldset disabled={!canEdit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`name-${p}`}>Name</label>
            <input id={`name-${p}`} name="name" defaultValue={plan?.name} required minLength={2} maxLength={60} className="input" />
          </div>
          {!plan && (
            <div>
              <label className="label" htmlFor={`key-${p}`}>Kürzel (fest, z. B. für die spätere Abrechnung)</label>
              <input id={`key-${p}`} name="key" required pattern="[a-z0-9\-]{2,30}" placeholder="pro" className="input" />
            </div>
          )}
          <div className={plan ? "" : "sm:col-span-2"}>
            <label className="label" htmlFor={`desc-${p}`}>Beschreibung</label>
            <input id={`desc-${p}`} name="description" defaultValue={plan?.description} maxLength={300} className="input" />
          </div>
          <div>
            <label className="label" htmlFor={`price-${p}`}>Preis pro Monat (€)</label>
            <input id={`price-${p}`} name="price" defaultValue={centsToInput(plan?.priceCents ?? 0)} inputMode="decimal" className="input tabular" />
          </div>
          <div>
            <label className="label" htmlFor={`sort-${p}`}>Reihenfolge</label>
            <input id={`sort-${p}`} name="sortOrder" type="number" min={0} max={999} defaultValue={plan?.sortOrder ?? 0} className="input" />
          </div>
        </div>
        <div>
          <p className="label">Enthaltene Satzgruppen</p>
          <SetGroupChecklist setGroups={setGroups} selected={new Set(plan?.setGroups.map((g) => g.setGroupId) ?? [])} />
        </div>
        <div>
          <ExtraSets sets={sets} selected={new Set(plan?.sets.map((s) => s.setId) ?? [])} />
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="isDefault" defaultChecked={plan?.isDefault} className="h-5 w-5 accent-[var(--accent)]" />
          Standard-Abo (für neue Nutzer und alle ohne eigenes Abo)
        </label>
      </fieldset>
      {canEdit && <SubmitButton>{plan ? "Speichern" : "Abo anlegen"}</SubmitButton>}
    </ActionForm>
  );
}
