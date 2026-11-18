import { requireUser } from "@/lib/auth";
import { loadOverview } from "@/lib/data";
import { ACCOUNT_META, type AccountKind } from "@/lib/constants";
import { centsToInput, formatCents, formatDate } from "@/lib/format";
import { transfer, updateBalance } from "@/actions/finance";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Card, PageHeader } from "@/components/ui";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { loadPlanning } from "@/lib/planningData";
import { AusgleichPanel, OrdersPanel, TodoList, TransfersPanel, type AccountInfo } from "@/components/planning/PlanningWidgets";

export const metadata = { title: "Konten" };

export default async function KontenPage() {
  const user = await requireUser();
  const overview = await loadOverview(user.id);
  const { accounts, allocation, settings } = overview;
  const planning = await loadPlanning(user.id, overview);
  const accountInfo = Object.fromEntries(accounts.map((a) => [a.kind, { name: a.name, color: a.color, balanceCents: a.balanceCents }])) as AccountInfo;

  const target: Record<AccountKind, string> = {
    FIXKOSTEN: `Mindestpuffer ${formatCents(settings.minBufferCents)} + anfallende Fixkosten`,
    SPAREN: `Dauerauftrag ${formatCents(allocation.orders.SPAREN)} / Monat${allocation.reserveAccountKind === "SPAREN" && allocation.reserveCents ? ` (davon ${formatCents(allocation.reserveCents)} Rücklagen)` : ""}`,
    NOTGROSCHEN: `Ziel: ${formatCents(allocation.emergencyTargetCents)} (${settings.emergencyMonths} Monate Fixkosten)`,
    FREIZEIT: `Budget ${formatCents(allocation.freizeitCents)} / Monat`,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deine vier Konten"
        subtitle="Gleiche die Kontostände regelmäßig mit deiner Bank-App ab. Dann stimmen alle Prognosen. Namen und Farben änderst du unter Design & Anpassen."
      />

      <Card title="Checkliste" subtitle="Was gerade zu tun ist (wie „Erforderliche Aktionen“ in deiner Excel)">
        <TodoList todos={planning.todos} transfers={planning.transfers} accounts={accountInfo} />
      </Card>

      <div className="stagger grid gap-4 md:grid-cols-2">
        {accounts.map((a) => {
          const meta = ACCOUNT_META[a.kind as AccountKind];
          return (
            <section key={a.id} className="card relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: a.color }} />
              <div className="flex flex-wrap items-start justify-between gap-3 pl-2">
                <div>
                  <h2 className="font-bold">{a.name}</h2>
                  <p className="mt-0.5 max-w-sm text-xs text-muted">{meta.description}</p>
                </div>
                <p className="tabular text-2xl font-black"><AnimatedNumber cents={a.balanceCents} /></p>
              </div>
              <p className="mt-3 pl-2 text-xs text-muted">{target[a.kind as AccountKind]}</p>
              <p className="mt-1 pl-2 text-xs text-subtle">
                {a.balanceUpdatedAt ? `Zuletzt abgeglichen: ${formatDate(a.balanceUpdatedAt)}` : "Noch nie abgeglichen"}
              </p>
              <ActionForm action={updateBalance} resetOnSuccess={false} className="mt-4 pl-2">
                <input type="hidden" name="accountId" value={a.id} />
                <label className="label" htmlFor={`bal-${a.id}`}>Tatsächlicher Kontostand laut Bank</label>
                <div className="flex gap-2">
                  <input id={`bal-${a.id}`} name="balance" className="input tabular" defaultValue={centsToInput(a.balanceCents)} inputMode="decimal" />
                  <SubmitButton className="btn-ghost shrink-0">Abgleichen</SubmitButton>
                </div>
              </ActionForm>
            </section>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Ausgleich Fixkostenkonto" subtitle="Tiefster Stand der Prognose gegen Mindestpuffer, plus optionale Zusatz-Zahlung">
          <AusgleichPanel
            ausgleich={planning.ausgleich}
            minBufferCents={settings.minBufferCents}
            accounts={accountInfo}
            suggestedSource={planning.transfers.find((t) => t.to === "FIXKOSTEN")?.from ?? null}
          />
        </Card>
        <div className="space-y-6">
          <Card title="Notwendige Überweisungen" subtitle="Ist gegen Soll je Konto: Puffer, Rücklagen, Notgroschen-Ziel, freies Freizeit-Guthaben">
            <TransfersPanel transfers={planning.transfers} uncovered={planning.uncovered} accounts={accountInfo} />
          </Card>
          <Card title="Daueraufträge" subtitle="Empfehlung gegen das, was bei deiner Bank eingerichtet ist">
            <OrdersPanel
              recommended={allocation.orders}
              confirmed={planning.confirmedOrders}
              validFrom={planning.ordersValidFrom?.toISOString() ?? null}
              accounts={accountInfo}
              transferDay={settings.transferDay}
            />
          </Card>
        </div>
      </div>

      <Card title="Umbuchung zwischen Konten" subtitle="Zum Beispiel die monatlichen Daueraufträge oder eine Ausgleichszahlung">
        <ActionForm action={transfer} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <div>
            <label className="label" htmlFor="fromId">Von</label>
            <select id="fromId" name="fromId" className="input">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="toId">Nach</label>
            <select id="toId" name="toId" className="input" defaultValue={accounts[3]?.id}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="amount">Betrag (€)</label>
            <input id="amount" name="amount" className="input tabular" placeholder="50,00" inputMode="decimal" required />
          </div>
          <div>
            <label className="label" htmlFor="note">Notiz (optional)</label>
            <input id="note" name="note" className="input" placeholder="Dauerauftrag Mai" />
          </div>
          <SubmitButton>Umbuchen</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
