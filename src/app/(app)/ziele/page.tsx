import { Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getAccess } from "@/lib/access";
import { FeatureLocked } from "@/components/FeatureLocked";
import { prisma } from "@/lib/db";
import { loadOverview } from "@/lib/data";
import { formatCents, formatDate } from "@/lib/format";
import { addGoal, deleteGoalUndoable, depositGoal, restoreGoal } from "@/actions/finance";
import { UndoDelete } from "@/components/UndoDelete";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Card, PageHeader, ProgressBar } from "@/components/ui";
import { RadialProgress } from "@/components/charts";

const COLORS = ["#10b981", "#3b82f6", "#a855f7", "#f59e0b", "#ec4899", "#06b6d4"];

function monthsBetween(a: Date, b: Date) {
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
}

export const metadata = { title: "Sparziele" };

export default async function ZielePage() {
  const user = await requireUser();
  const access = await getAccess(user.id);
  if (!access.permissions.has("goals.use")) return <FeatureLocked feature="goals.use" planName={access.plan?.name} />;
  const [{ allocation, balances }, goals] = await Promise.all([
    loadOverview(user.id),
    prisma.savingsGoal.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
  ]);
  const now = new Date();
  const totalSaved = goals.reduce((s, g) => s + g.savedCents, 0);
  const totalTarget = goals.reduce((s, g) => s + g.targetCents, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sparziele"
        subtitle={`Deine Ziele werden vom Sparkonto bedient. Aktuell sparst du ${formatCents(allocation.sparenCents)} pro Monat, auf dem Sparkonto liegen ${formatCents(balances.SPAREN)}.`}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Neues Sparziel" className="xl:col-span-1">
          <ActionForm action={addGoal} className="space-y-3">
            <div>
              <label className="label" htmlFor="name">Wofür sparst du?</label>
              <input id="name" name="name" className="input" placeholder="z. B. Auslandssemester, Laptop" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="target">Zielbetrag (€)</label>
                <input id="target" name="target" className="input tabular" inputMode="decimal" placeholder="1000" required />
              </div>
              <div>
                <label className="label" htmlFor="saved">Schon gespart (€)</label>
                <input id="saved" name="saved" className="input tabular" inputMode="decimal" placeholder="0" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="deadline">Bis wann? (optional)</label>
              <input id="deadline" name="deadline" type="date" className="input" />
            </div>
            <SubmitButton>Ziel anlegen</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Fortschritt aller Ziele" subtitle={`${formatCents(totalSaved)} von ${formatCents(totalTarget)} gespart`} className="xl:col-span-2">
          <RadialProgress
            data={goals.map((g, i) => ({ name: g.name, value: Math.min(100, (g.savedCents / g.targetCents) * 100), fill: COLORS[i % COLORS.length] }))}
          />
        </Card>
      </div>

      <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {goals.map((g, i) => {
          const progress = g.savedCents / g.targetCents;
          const missing = Math.max(0, g.targetCents - g.savedCents);
          const months = g.deadline ? monthsBetween(now, g.deadline) : null;
          const perMonth = months ? Math.ceil(missing / months) : null;
          const eta = allocation.sparenCents > 0 ? Math.ceil(missing / allocation.sparenCents) : null;
          return (
            <section key={g.id} className="card card-interactive">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-bold">{g.name}</h2>
                <UndoDelete onDelete={deleteGoalUndoable.bind(null, g.id)} onRestore={restoreGoal} message={`Sparziel „${g.name}“ gelöscht`} label="Ziel löschen" />
              </div>
              <p className="tabular mt-2 text-2xl font-bold">
                {formatCents(g.savedCents)} <span className="text-sm font-normal text-muted">/ {formatCents(g.targetCents)}</span>
              </p>
              <div className="mt-3"><ProgressBar value={progress} color={COLORS[i % COLORS.length]} /></div>
              <ul className="mt-3 space-y-1 text-xs text-muted">
                <li>{progress >= 1 ? "🎉 Ziel erreicht!" : `Es fehlen noch ${formatCents(missing)}`}</li>
                {g.deadline && <li>Ziel bis {formatDate(g.deadline)}{perMonth ? ` → ${formatCents(perMonth)} pro Monat nötig` : ""}</li>}
                {progress < 1 && eta && <li>Mit deiner ganzen Sparrate in ca. {eta} Monat{eta === 1 ? "" : "en"} erreicht</li>}
              </ul>
              {progress < 1 && (
                <ActionForm action={depositGoal} className="mt-4">
                  <input type="hidden" name="id" value={g.id} />
                  <div className="flex gap-2">
                    <input name="amount" className="input tabular" inputMode="decimal" placeholder="Betrag einzahlen" required />
                    <SubmitButton className="btn-ghost shrink-0">+ Einzahlen</SubmitButton>
                  </div>
                </ActionForm>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
