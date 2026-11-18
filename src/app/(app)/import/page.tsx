import { Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getAccess } from "@/lib/access";
import { FeatureLocked } from "@/components/FeatureLocked";
import { prisma } from "@/lib/db";
import { loadAccountsLite } from "@/lib/data";
import { deleteImportRule } from "@/actions/import";
import { Card, PageHeader } from "@/components/ui";
import { ImportClient } from "./ImportClient";
import { getAiStatus } from "@/lib/ai/usage";

export const metadata = { title: "CSV-Import" };

export default async function ImportPage() {
  const user = await requireUser();
  const access = await getAccess(user.id);
  if (!access.permissions.has("import.csv")) return <FeatureLocked feature="import.csv" planName={access.plan?.name} />;
  const [accounts, rules, ai] = await Promise.all([
    loadAccountsLite(user.id),
    prisma.importRule.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    getAiStatus(user.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Umsätze importieren"
        subtitle="Lade den CSV-Export aus deinem Online-Banking hoch. Vierklee erkennt das Format, schlägt Kategorien vor und überspringt bereits importierte Umsätze."
      />
      <ImportClient accounts={accounts} rules={rules.map((r) => ({ pattern: r.pattern, category: r.category }))} ai={{ enabled: ai.enabled, available: ai.available && ai.permitted, remaining: ai.remaining }} />

      <Card title="Gelernte Zuordnungen" subtitle="Wenn du beim Import eine Kategorie änderst (oder Claude einen Empfänger einordnet), merkt sich Vierklee das für den Empfänger.">
        {rules.length === 0 ? (
          <p className="text-sm text-muted">Noch keine. Ändere in der Vorschau eine Kategorie, dann taucht die Regel hier auf.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate font-semibold">„{r.pattern}“</span>
                {r.source === "ai" && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-black text-accent" title="Von Claude vorgeschlagen">KI</span>}
                <span className="chip pointer-events-none">{r.category}</span>
                <form action={deleteImportRule}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="icon-btn hover:bg-bad/10 hover:text-bad" aria-label={`Regel für ${r.pattern} löschen`}>
                    <Trash2 size={16} />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
