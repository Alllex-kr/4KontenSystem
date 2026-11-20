import { Lock, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadOverview } from "@/lib/data";
import { centsToInput, formatCents, intlLocale } from "@/lib/format";
import { loadDemoData, saveSettings } from "@/actions/finance";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Card, PageHeader } from "@/components/ui";
import { LegalLinks } from "@/components/LegalLinks";
import { AccountSection } from "./AccountSection";
import { prisma } from "@/lib/db";
import { saveAiSettings } from "@/actions/ai";
import { getAiStatus } from "@/lib/ai/usage";
import { getAccess } from "@/lib/access";
import { AI_MODEL } from "@/lib/ai/categorize";
import { getT } from "@/lib/i18n/server";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { rich } from "@/lib/i18n/rich";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Einstellungen") };
}

export default async function EinstellungenPage() {
  const t = await getT();
  const user = await requireUser();
  const { settings, summary, allocation } = await loadOverview(user.id);
  const [aiStatus, access, account] = await Promise.all([
    getAiStatus(user.id),
    getAccess(user.id),
    prisma.user.findUnique({ where: { id: user.id }, select: { emailVerifiedAt: true, passwordHash: true } }),
  ]);
  const ai = { ...aiStatus, planName: access.plan?.name };

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t("Einstellungen")} subtitle={t("Lege fest, wie dein Einkommen auf die vier Konten verteilt wird.")} />

      <Card title={t("Regeln für die Verteilung")}>
        <ActionForm action={saveSettings} resetOnSuccess={false} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="minBuffer">{t("Mindestpuffer Fixkostenkonto (€)")}</label>
            <input id="minBuffer" name="minBuffer" className="input tabular" defaultValue={centsToInput(settings.minBufferCents)} inputMode="decimal" />
            <p className="mt-1 text-xs text-muted">{t("Dieser Betrag soll immer auf dem Fixkostenkonto bleiben.")}</p>
          </div>
          <div>
            <label className="label" htmlFor="transferDay">{t("Tag der Daueraufträge")}</label>
            <input id="transferDay" name="transferDay" type="number" min={1} max={28} className="input" defaultValue={settings.transferDay} />
            <p className="mt-1 text-xs text-muted">{t("Am besten kurz nach dem Geldeingang.")}</p>
          </div>
          <div>
            <label className="label" htmlFor="emergencyMonths">{t("Notgroschen-Ziel (Monate Fixkosten)")}</label>
            <input id="emergencyMonths" name="emergencyMonths" type="number" min={1} max={12} className="input" defaultValue={settings.emergencyMonths} />
            <p className="mt-1 text-xs text-muted">{t("Empfehlung: 3 Monate. Aktuell ergibt das {amount}.", { amount: formatCents(summary.fixedTotalCents * settings.emergencyMonths) })}</p>
          </div>
          <div>
            <label className="label" htmlFor="emergencyRatePct">{t("Anteil fürs Notgroschenkonto (%)")}</label>
            <input id="emergencyRatePct" name="emergencyRatePct" type="number" min={0} max={80} className="input" defaultValue={settings.emergencyRatePct} />
            <p className="mt-1 text-xs text-muted">{t("Nur solange das Ziel noch nicht erreicht ist.")}</p>
          </div>
          <div>
            <label className="label" htmlFor="savingsRatePct">{t("Sparquote (%)")}</label>
            <input id="savingsRatePct" name="savingsRatePct" type="number" min={0} max={80} className="input" defaultValue={settings.savingsRatePct} />
            <p className="mt-1 text-xs text-muted">{t("Aktuell {amount} pro Monat.", { amount: formatCents(allocation.sparenCents) })}</p>
          </div>
          <div className="flex items-end">
            <SubmitButton>{t("Speichern")}</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card title={t("So funktioniert das Vier-Konten-System")}>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-fg">
          <li>{rich(t("Dein ganzes Einkommen geht auf das <b>Fixkostenkonto</b>. Von dort laufen Miete, Handy und Versicherungen."), { b: (x) => <b>{x}</b> })}</li>
          <li>{rich(t("Unregelmäßige Kosten wie Semesterbeitrag oder Jahresversicherung legst du dort <b>monatlich anteilig</b> zurück."), { b: (x) => <b>{x}</b> })}</li>
          <li>{rich(t("Bis dein <b>Notgroschen</b> voll ist (z. B. 3 Monate Fixkosten), geht ein fester Anteil dorthin."), { b: (x) => <b>{x}</b> })}</li>
          <li>{rich(t("Die <b>Sparquote</b> wandert aufs Sparkonto, für Sparziele oder einen ETF-Sparplan."), { b: (x) => <b>{x}</b> })}</li>
          <li>{rich(t("Der Rest landet auf dem <b>Freizeitkonto</b>. Das darfst du ohne schlechtes Gewissen ausgeben."), { b: (x) => <b>{x}</b> })}</li>
        </ol>
      </Card>

      <section id="ki" className="scroll-mt-20">
        <Card title={t("KI-Kategorisierung mit Claude")} subtitle={t("Umsätze, die keine Regel und kein Stichwort erkennt, ordnet Claude beim CSV-Import und Bank-Sync ein.")}>
          {!ai.permitted ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line-strong p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Lock size={17} />
              </span>
              <p className="min-w-0 flex-1 text-sm">
                <span className="block font-bold">{ai.planName ? t("In deinem Abo „{plan}“ nicht enthalten", { plan: ai.planName }) : t("In deinem Abo nicht enthalten")}</span>
                <span className="block text-muted">{t("Die KI-Funktionen gibt es mit einem Abo, das sie enthält, zum Beispiel FinanzKlee Plus.")}</span>
              </p>
            </div>
          ) : !ai.available ? (
            <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">
              {rich(t("Noch nicht eingerichtet: Trag einen API-Schlüssel als <code>ANTHROPIC_API_KEY</code> in die <code>.env</code> ein und starte den Server neu."), { code: (x) => <code>{x}</code> })}
            </p>
          ) : (
            <ActionForm action={saveAiSettings} resetOnSuccess={false} className="space-y-4">
              <label className="flex items-start gap-3 rounded-xl border border-line p-3">
                <input type="checkbox" name="aiCategorization" defaultChecked={ai.enabled} className="mt-1 h-5 w-5 accent-[var(--accent)]" />
                <span className="text-sm">
                  <span className="block font-bold">{t("Ich möchte unklare Umsätze von Claude einordnen lassen")}</span>
                  <span className="block text-muted">
                    {t("Dafür werden nur Empfänger, Verwendungszweck (ohne IBANs, lange Nummern und E-Mail-Adressen) und Betrag an Anthropic übermittelt. Gleiche Empfänger werden nur einmal gefragt, das Ergebnis merkt sich FinanzKlee als Regel.")}
                  </span>
                </span>
              </label>
              <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
                <div>
                  <label className="label" htmlFor="aiMonthlyLimit">{t("Höchstens pro Monat (Umsätze)")}</label>
                  <input id="aiMonthlyLimit" name="aiMonthlyLimit" type="number" min={0} max={10000} className="input" defaultValue={ai.limit} />
                </div>
                <SubmitButton>{t("Speichern")}</SubmitButton>
              </div>
            </ActionForm>
          )}
          {ai.permitted && (
            <>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-xl bg-surface-2 p-2">
              <p className="tabular text-lg font-black">{ai.used}</p>
              <p className="text-xs text-muted">{t("diesen Monat")}</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-2">
              <p className="tabular text-lg font-black">{ai.remaining}</p>
              <p className="text-xs text-muted">{t("noch frei")}</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-2">
              <p className="tabular text-lg font-black">{ai.estimatedUsd.toLocaleString(intlLocale(), { style: "currency", currency: "USD" })}</p>
              <p className="text-xs text-muted">{t("Kosten (geschätzt)")}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">{t("Modell:")}{" "}{AI_MODEL}{t(". Die Kosten sind nach Listenpreis geschätzt, die genaue Abrechnung siehst du in der Anthropic-Konsole.")}</p>
            </>
          )}
        </Card>
      </section>

      <Card title={t("Sprache")} subtitle={t("Automatisch nimmt die Sprache deines Browsers. Die Wahl gilt für dein Konto auf allen Geräten.")}>
        <LanguageSwitcher saved={settings.language ?? null} className="max-w-xs" />
      </Card>

      <Card title={t("Beispieldaten")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-sm text-muted">
            {t("Ersetzt alle Zahlungen, Buchungen, Sparziele und Kontostände durch ein Beispiel-Budget. Deine bisherigen Einträge gehen dabei verloren.")}
          </p>
          <form action={loadDemoData}>
            <button className="btn-ghost"><Sparkles size={16} />{" "}{t("Beispieldaten laden")}</button>
          </form>
        </div>
      </Card>

      <Card title={t("Dein Konto")}>
        <AccountSection email={user.email} verified={Boolean(account?.emailVerifiedAt)} hasPassword={Boolean(account?.passwordHash)} />
      </Card>

      <LegalLinks className="pb-2" />
    </div>
  );
}
