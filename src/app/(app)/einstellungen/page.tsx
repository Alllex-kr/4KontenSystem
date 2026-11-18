import { Lock, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadOverview } from "@/lib/data";
import { centsToInput, formatCents } from "@/lib/format";
import { loadDemoData, saveSettings } from "@/actions/finance";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Card, PageHeader } from "@/components/ui";
import { saveAiSettings } from "@/actions/ai";
import { getAiStatus } from "@/lib/ai/usage";
import { getAccess } from "@/lib/access";
import { AI_MODEL } from "@/lib/ai/categorize";

export const metadata = { title: "Einstellungen" };

export default async function EinstellungenPage() {
  const user = await requireUser();
  const { settings, summary, allocation } = await loadOverview(user.id);
  const [aiStatus, access] = await Promise.all([getAiStatus(user.id), getAccess(user.id)]);
  const ai = { ...aiStatus, planName: access.plan?.name };

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Einstellungen" subtitle="Lege fest, wie dein Einkommen auf die vier Konten verteilt wird." />

      <Card title="Regeln für die Verteilung">
        <ActionForm action={saveSettings} resetOnSuccess={false} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="minBuffer">Mindestpuffer Fixkostenkonto (€)</label>
            <input id="minBuffer" name="minBuffer" className="input tabular" defaultValue={centsToInput(settings.minBufferCents)} inputMode="decimal" />
            <p className="mt-1 text-xs text-muted">Dieser Betrag soll immer auf dem Fixkostenkonto bleiben.</p>
          </div>
          <div>
            <label className="label" htmlFor="transferDay">Tag der Daueraufträge</label>
            <input id="transferDay" name="transferDay" type="number" min={1} max={28} className="input" defaultValue={settings.transferDay} />
            <p className="mt-1 text-xs text-muted">Am besten kurz nach dem Geldeingang.</p>
          </div>
          <div>
            <label className="label" htmlFor="emergencyMonths">Notgroschen-Ziel (Monate Fixkosten)</label>
            <input id="emergencyMonths" name="emergencyMonths" type="number" min={1} max={12} className="input" defaultValue={settings.emergencyMonths} />
            <p className="mt-1 text-xs text-muted">Empfehlung: 3 Monate. Aktuell ergibt das {formatCents(summary.fixedTotalCents * settings.emergencyMonths)}.</p>
          </div>
          <div>
            <label className="label" htmlFor="emergencyRatePct">Anteil fürs Notgroschenkonto (%)</label>
            <input id="emergencyRatePct" name="emergencyRatePct" type="number" min={0} max={80} className="input" defaultValue={settings.emergencyRatePct} />
            <p className="mt-1 text-xs text-muted">Nur solange das Ziel noch nicht erreicht ist.</p>
          </div>
          <div>
            <label className="label" htmlFor="savingsRatePct">Sparquote (%)</label>
            <input id="savingsRatePct" name="savingsRatePct" type="number" min={0} max={80} className="input" defaultValue={settings.savingsRatePct} />
            <p className="mt-1 text-xs text-muted">Aktuell {formatCents(allocation.sparenCents)} pro Monat.</p>
          </div>
          <div className="flex items-end">
            <SubmitButton>Speichern</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card title="So funktioniert das Vier-Konten-System">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-fg">
          <li>Dein ganzes Einkommen geht auf das <b>Fixkostenkonto</b>. Von dort laufen Miete, Handy und Versicherungen.</li>
          <li>Unregelmäßige Kosten wie Semesterbeitrag oder Jahresversicherung legst du dort <b>monatlich anteilig</b> zurück.</li>
          <li>Bis dein <b>Notgroschen</b> voll ist (z. B. 3 Monate Fixkosten), geht ein fester Anteil dorthin.</li>
          <li>Die <b>Sparquote</b> wandert aufs Sparkonto, für Sparziele oder einen ETF-Sparplan.</li>
          <li>Der Rest landet auf dem <b>Freizeitkonto</b>. Das darfst du ohne schlechtes Gewissen ausgeben.</li>
        </ol>
      </Card>

      <section id="ki" className="scroll-mt-20">
        <Card title="KI-Kategorisierung mit Claude" subtitle="Umsätze, die keine Regel und kein Stichwort erkennt, ordnet Claude beim CSV-Import und Bank-Sync ein.">
          {!ai.permitted ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line-strong p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Lock size={17} />
              </span>
              <p className="min-w-0 flex-1 text-sm">
                <span className="block font-bold">In deinem Abo{ai.planName ? ` „${ai.planName}“` : ""} nicht enthalten</span>
                <span className="block text-muted">Die KI-Funktionen gibt es mit einem Abo, das sie enthält, zum Beispiel Vierklee Plus.</span>
              </p>
            </div>
          ) : !ai.available ? (
            <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">
              Noch nicht eingerichtet: Trag einen API-Schlüssel als <code>ANTHROPIC_API_KEY</code> in die <code>.env</code> ein und starte den Server neu.
            </p>
          ) : (
            <ActionForm action={saveAiSettings} resetOnSuccess={false} className="space-y-4">
              <label className="flex items-start gap-3 rounded-xl border border-line p-3">
                <input type="checkbox" name="aiCategorization" defaultChecked={ai.enabled} className="mt-1 h-5 w-5 accent-[var(--accent)]" />
                <span className="text-sm">
                  <span className="block font-bold">Ich möchte unklare Umsätze von Claude einordnen lassen</span>
                  <span className="block text-muted">
                    Dafür werden nur Empfänger, Verwendungszweck (ohne IBANs, lange Nummern und E-Mail-Adressen) und Betrag an Anthropic übermittelt. Gleiche Empfänger werden nur einmal gefragt, das Ergebnis merkt sich Vierklee als Regel.
                  </span>
                </span>
              </label>
              <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
                <div>
                  <label className="label" htmlFor="aiMonthlyLimit">Höchstens pro Monat (Umsätze)</label>
                  <input id="aiMonthlyLimit" name="aiMonthlyLimit" type="number" min={0} max={10000} className="input" defaultValue={ai.limit} />
                </div>
                <SubmitButton>Speichern</SubmitButton>
              </div>
            </ActionForm>
          )}
          {ai.permitted && (
            <>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-xl bg-surface-2 p-2">
              <p className="tabular text-lg font-black">{ai.used}</p>
              <p className="text-xs text-muted">diesen Monat</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-2">
              <p className="tabular text-lg font-black">{ai.remaining}</p>
              <p className="text-xs text-muted">noch frei</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-2">
              <p className="tabular text-lg font-black">{ai.estimatedUsd.toLocaleString("de-DE", { style: "currency", currency: "USD" })}</p>
              <p className="text-xs text-muted">Kosten (geschätzt)</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">Modell: {AI_MODEL}. Die Kosten sind nach Listenpreis geschätzt, die genaue Abrechnung siehst du in der Anthropic-Konsole.</p>
            </>
          )}
        </Card>
      </section>

      <Card title="Beispieldaten">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-sm text-muted">
            Ersetzt alle Zahlungen, Buchungen, Sparziele und Kontostände durch ein Beispiel-Budget. Deine bisherigen Einträge gehen dabei verloren.
          </p>
          <form action={loadDemoData}>
            <button className="btn-ghost"><Sparkles size={16} /> Beispieldaten laden</button>
          </form>
        </div>
      </Card>
    </div>
  );
}
