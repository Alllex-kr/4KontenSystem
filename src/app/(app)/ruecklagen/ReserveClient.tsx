"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, Pencil, Plus, Shuffle, Sparkles, Target } from "lucide-react";
import {
  addReservePurchase,
  applyReserveForecast,
  deleteReserveItem,
  deleteReservePurchase,
  restoreReserveItem,
  restoreReservePurchase,
  saveReserveItem,
  saveReserveSettings,
  setUseEffective,
} from "@/actions/planning";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { UndoDelete } from "@/components/UndoDelete";
import { Alert, Card, EmptyState, ProgressBar } from "@/components/ui";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { useToast } from "@/components/Toaster";
import { centsToInput, formatCents, formatDate, formatNumber } from "@/lib/format";
import { useT } from "@/lib/i18n/client";

export type ReserveItemView = {
  id: string;
  name: string;
  kind: "PLANNED" | "IRREGULAR";
  plannedIntervalMonths: number | null;
  plannedAmountCents: number | null;
  useEffective: boolean;
  purchases: { id: string; date: string; amountCents: number; note: string | null }[];
  stats: {
    monthlyCents: number;
    intervalMonths: number | null;
    computedIntervalMonths: number | null;
    nextDate: string | null;
    targetCents: number;
    accruedCents: number;
    effectiveMonthlyCents: number | null;
    estimateMonthlyCents: number | null;
    avgIntervalDays: number | null;
    avgAmountCents: number | null;
  };
};

type Summary = {
  forecastMonthlyCents: number;
  fixedMonthlyCents: number;
  tolerancePct: number;
  underplanned: boolean;
  sollBalanceCents: number;
  accountKind: "SPAREN" | "NOTGROSCHEN";
  accountName: string;
  accountColor: string;
  accountAvailableCents: number;
  earmarkedCents: number;
  allocatedCents: number;
};

const fmtMonths = (m: number | null, t: (k: string, v?: Record<string, string | number>) => string) =>
  m == null ? "–" : m === 1 ? t("monatlich") : m === 12 ? t("jährlich") : t("alle {n} Monate", { n: formatNumber(m, Number.isInteger(m) ? 0 : 1) });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function ReserveClient({ items, summary, accountNames }: { items: ReserveItemView[]; summary: Summary; accountNames: { SPAREN: string; NOTGROSCHEN: string } }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const planned = items.filter((i) => i.kind === "PLANNED");
  const irregular = items.filter((i) => i.kind === "IRREGULAR");
  const gap = summary.sollBalanceCents - summary.accountAvailableCents;

  return (
    <div className="space-y-6">
      {/* Zusammenfassung (Excel: "Reserve") */}
      <div className="stagger grid gap-4 md:grid-cols-3">
        <div className="card">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">{t("Prognose pro Monat")}</p>
          <p className="tabular mt-1 text-2xl font-black"><AnimatedNumber cents={summary.forecastMonthlyCents} /></p>
          <p className="mt-1 text-xs text-muted">{t("Summe aller Posten (Excel: „Effektiv pro Monat“)")}</p>
        </div>
        <div className="card">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">{t("Festgesetzt pro Monat")}</p>
          <p className={`tabular mt-1 text-2xl font-black ${summary.underplanned ? "text-warn" : ""}`}><AnimatedNumber cents={summary.fixedMonthlyCents} /></p>
          <p className="mt-1 text-xs text-muted">
            {summary.underplanned
              ? t("Zu wenig eingeplant: mehr als {tolerancePct} % unter der Prognose", { tolerancePct: summary.tolerancePct })
              : summary.fixedMonthlyCents > 0
                ? t("Dauerauftrag aufs {account}", { account: summary.accountName })
                : t("Noch kein Betrag festgesetzt")}
          </p>
        </div>
        <div className="card">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">{t("Soll-Stand heute")}</p>
          <p className="tabular mt-1 text-2xl font-black"><AnimatedNumber cents={summary.sollBalanceCents} /></p>
          <p className={`mt-1 text-xs ${gap > 0 ? "text-warn" : "text-good"}`}>
            {gap > 0 ? t("Auf dem {accountName} fehlen {v1}", { accountName: summary.accountName, v1: formatCents(gap) }) : t("Gedeckt auf dem {accountName} ✓", { accountName: summary.accountName })}
            {summary.earmarkedCents > 0 && <span className="text-muted">{" "}{t("(abzgl. {amount} für Sparziele)", { amount: formatCents(summary.earmarkedCents) })}</span>}
          </p>
        </div>
      </div>

      {summary.underplanned && (
        <Alert>
          <AlertTriangle size={16} className="mr-2 inline" />
          {t("Aktuell zu wenig eingeplant: Die Prognose liegt bei {forecast} pro Monat, festgesetzt sind {fixed}.", { forecast: formatCents(summary.forecastMonthlyCents), fixed: formatCents(summary.fixedMonthlyCents) })}{" "}
          <button
            className="font-black underline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await applyReserveForecast();
                router.refresh();
                toast({ message: r?.success ?? t("Übernommen") });
              })
            }
          >
            {t("Prognose übernehmen")}
          </button>
        </Alert>
      )}

      <Card title={t("Monatlicher Betrag")} subtitle={t("Dieser Betrag geht als Dauerauftrag vom Fixkostenkonto auf dein Rücklagen-Konto. Er wird vor Notgroschen, Sparen und Freizeit eingeplant.")}>
        <ActionForm action={saveReserveSettings} resetOnSuccess={false} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <div>
            <label className="label" htmlFor="monthly">{t("Festgesetzt pro Monat (€)")}</label>
            <input id="monthly" name="monthly" className="input tabular" inputMode="decimal" defaultValue={centsToInput(summary.fixedMonthlyCents)} />
          </div>
          <div>
            <label className="label" htmlFor="tolerance">{t("Warnen ab (% unter Prognose)")}</label>
            <input id="tolerance" name="tolerance" type="number" min={0} max={50} className="input" defaultValue={summary.tolerancePct} />
          </div>
          <div>
            <label className="label" htmlFor="accountKind">{t("Rücklagen liegen auf")}</label>
            <select id="accountKind" name="accountKind" className="input" defaultValue={summary.accountKind}>
              <option value="SPAREN">{accountNames.SPAREN}</option>
              <option value="NOTGROSCHEN">{accountNames.NOTGROSCHEN}</option>
            </select>
          </div>
          <div className="flex gap-2">
            <SubmitButton className="btn flex-1">{t("Speichern")}</SubmitButton>
            <button
              type="button"
              className="btn-ghost"
              title={t("Prognose übernehmen")}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await applyReserveForecast();
                  router.refresh();
                  toast({ message: r?.success ?? t("Übernommen") });
                })
              }
            >
              <Sparkles size={16} /> <span className="hidden xl:inline">{t("Prognose")}</span>
            </button>
          </div>
        </ActionForm>
        {summary.allocatedCents < summary.fixedMonthlyCents && (
          <p className="mt-2 text-xs text-warn">{t("Dein Einkommen reicht nur für {amount} davon.", { amount: formatCents(summary.allocatedCents) })}</p>
        )}
      </Card>

      {/* Posten */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-black">{t("Posten mit bekannter Wiederholung")}</h2>
          <p className="text-sm text-muted">{t("Du weißt, wann und wie viel, z. B. Weihnachtsgeschenke, Semesterticket, Brille.")}</p>
        </div>
        {planned.length === 0 ? (
          <EmptyState icon={<CalendarClock size={36} />} title={t("Noch keine geplanten Posten")} text={t("Lege unten einen Posten an, z. B. „Weihnachtsgeschenke, jährlich, 300 €“.")} />
        ) : (
          <div className="stagger grid gap-4 lg:grid-cols-2">{planned.map((i) => <ItemCard key={i.id} item={i} />)}</div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-black">{t("Posten mit unregelmäßiger Wiederholung")}</h2>
          <p className="text-sm text-muted">{t("Dokumentiere deine Käufe (z. B. jeden Urlaub). FinanzKlee rechnet daraus das durchschnittliche Intervall und den tatsächlichen Betrag pro Monat aus.")}</p>
        </div>
        {irregular.length === 0 ? (
          <EmptyState icon={<Shuffle size={36} />} title={t("Noch keine unregelmäßigen Posten")} text={t("Lege unten einen Posten an, z. B. „Urlaub“, und trage deine bisherigen Reisen ein.")} />
        ) : (
          <div className="stagger grid gap-4 lg:grid-cols-2">{irregular.map((i) => <ItemCard key={i.id} item={i} />)}</div>
        )}
      </section>

      <Card title={t("Neuer Posten")}>
        <ItemForm />
      </Card>
    </div>
  );
}

function ItemForm({ item, onDone }: { item?: ReserveItemView; onDone?: () => void }) {
  const t = useT();
  const [kind, setKind] = useState<"PLANNED" | "IRREGULAR">(item?.kind ?? "PLANNED");
  return (
    <ActionForm
      action={async (p, f) => {
        const r = await saveReserveItem(p, f);
        if (r?.success) onDone?.();
        return r;
      }}
      resetOnSuccess={!item}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
    >
      {item && <input type="hidden" name="id" value={item.id} />}
      <input type="hidden" name="kind" value={kind} />
      <div className="sm:col-span-2 lg:col-span-1">
        <label className="label" htmlFor={`n-${item?.id ?? "new"}`}>{t("Bezeichnung")}</label>
        <input id={`n-${item?.id ?? "new"}`} name="name" className="input" defaultValue={item?.name} placeholder={t("z. B. Weihnachtsgeschenke")} required />
      </div>
      <div className="sm:col-span-2 lg:col-span-2">
        <p className="label">{t("Art")}</p>
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-line-strong p-1" role="radiogroup">
          {(["PLANNED", "IRREGULAR"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={`min-h-9 rounded-lg px-2 text-sm font-bold transition ${kind === k ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"}`}
            >
              {k === "PLANNED" ? t("Bekannte Wiederholung") : t("Unregelmäßig")}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`i-${item?.id ?? "new"}`}>{kind === "PLANNED" ? t("Alle … Monate") : t("Sinnvolles Intervall (Monate)")}</label>
        <input id={`i-${item?.id ?? "new"}`} name="interval" type="number" min={1} max={240} className="input" defaultValue={item?.plannedIntervalMonths ?? ""} placeholder={kind === "PLANNED" ? "z. B. 12" : "optional"} />
      </div>
      <div>
        <label className="label" htmlFor={`a-${item?.id ?? "new"}`}>{kind === "PLANNED" ? t("Geplanter Betrag (€)") : t("Betrag pro Intervall (€)")}</label>
        <input id={`a-${item?.id ?? "new"}`} name="amount" className="input tabular" inputMode="decimal" defaultValue={item?.plannedAmountCents != null ? centsToInput(item.plannedAmountCents) : ""} placeholder={kind === "PLANNED" ? "z. B. 300" : "optional"} />
      </div>
      <p className="text-xs text-muted sm:col-span-2 lg:col-span-4">
        {kind === "PLANNED"
          ? t("Leer gelassen, nimmt FinanzKlee das Intervall aus deinen letzten zwei Käufen und den Betrag aus dem letzten Kauf.")
          : t("Intervall und Betrag sind deine Schätzung. Mit genug dokumentierten Käufen kannst du auf den tatsächlichen Betrag umschalten.")}
      </p>
      <SubmitButton className="btn">
        <Plus size={16} /> {item ? t("Speichern") : t("Anlegen")}
      </SubmitButton>
    </ActionForm>
  );
}

function ItemCard({ item }: { item: ReserveItemView }) {
  const t = useT();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const s = item.stats;
  const progress = s.targetCents > 0 ? s.accruedCents / s.targetCents : 0;
  const due = s.nextDate ? new Date(s.nextDate) : null;
  const daysToDue = due ? Math.ceil((due.getTime() - Date.now()) / 86_400_000) : null;

  return (
    <section className="card card-interactive">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-black">{item.name}</h3>
          <p className="text-xs text-muted">
            {item.kind === "PLANNED"
              ? fmtMonths(s.intervalMonths, t) + (item.plannedIntervalMonths == null && s.computedIntervalMonths ? " " + t("(aus deinen Käufen)") : "")
              : t("{n} dokumentierte Käufe", { n: item.purchases.length }) + (s.avgIntervalDays ? t(" · Ø alle {n} Tage", { n: s.avgIntervalDays }) : "")}
          </p>
        </div>
        <div className="flex shrink-0">
          <button className="icon-btn" aria-label={t("Bearbeiten")} onClick={() => setEditing((e) => !e)}><Pencil size={16} /></button>
          <UndoDelete onDelete={() => deleteReserveItem(item.id)} onRestore={restoreReserveItem} message={t("„{name}“ gelöscht", { name: item.name })} label={t("{name} löschen", { name: item.name })} />
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="tabular text-2xl font-black"><AnimatedNumber cents={s.monthlyCents} /></p>
          <p className="text-xs text-muted">{t("pro Monat zurücklegen")}</p>
        </div>
        {due && (
          <div className="text-right">
            <p className={`text-sm font-bold ${daysToDue != null && daysToDue <= 31 ? "text-warn" : ""}`}>{formatDate(due)}</p>
            <p className="text-xs text-muted">{daysToDue != null && daysToDue < 0 ? t("überfällig") : t("nächste Fälligkeit")}</p>
          </div>
        )}
      </div>

      {s.targetCents > 0 && (
        <div className="mt-3">
          <ProgressBar value={progress} color="var(--accent)" />
          <p className="mt-1 text-xs text-muted">
            <span className="tabular">{formatCents(s.accruedCents)}</span>{" "}{t("von")}{" "}<span className="tabular">{formatCents(s.targetCents)}</span>{" "}{t("angespart")}
            {progress >= 1 && <CheckCircle2 size={13} className="ml-1 inline text-good" />}
          </p>
        </div>
      )}

      {item.kind === "IRREGULAR" && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => start(async () => { await setUseEffective(item.id, false); router.refresh(); })}
            aria-pressed={!item.useEffective}
            className={`rounded-xl border p-2 text-left transition ${!item.useEffective ? "border-accent bg-accent-soft" : "border-line"}`}
          >
            <span className="block font-bold">{t("Geschätzt")}</span>
            <span className="tabular">{s.estimateMonthlyCents != null ? t("{v0} / Monat", { v0: formatCents(s.estimateMonthlyCents) }) : t("Intervall + Betrag fehlen")}</span>
          </button>
          <button
            type="button"
            disabled={s.effectiveMonthlyCents == null}
            onClick={() => start(async () => { await setUseEffective(item.id, true); router.refresh(); })}
            aria-pressed={item.useEffective}
            className={`rounded-xl border p-2 text-left transition disabled:opacity-50 ${item.useEffective ? "border-accent bg-accent-soft" : "border-line"}`}
          >
            <span className="block font-bold">{t("Tatsächlich")}</span>
            <span className="tabular">{s.effectiveMonthlyCents != null ? t("{v0} / Monat", { v0: formatCents(s.effectiveMonthlyCents) }) : t("mind. 2 Käufe nötig")}</span>
          </button>
        </div>
      )}

      {editing && (
        <div className="animate-fade-down mt-4 rounded-xl bg-surface-2 p-3">
          <ItemForm item={item} onDone={() => setEditing(false)} />
        </div>
      )}

      <button onClick={() => setOpen((o) => !o)} className="mt-3 flex w-full items-center justify-between rounded-xl px-1 py-1.5 text-sm font-bold text-muted hover:text-fg">
        <span className="flex items-center gap-1.5"><Target size={15} />{" "}{t("Käufe dokumentieren ({n})", { n: item.purchases.length })}</span>
        <ChevronDown size={16} className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="animate-fade-down space-y-3">
          {item.purchases.length > 0 && (
            <ul className="divide-y divide-line text-sm">
              {[...item.purchases].reverse().map((p) => (
                <li key={p.id} className="flex items-center gap-2 py-1.5">
                  <span className="tabular w-24 shrink-0 text-muted">{formatDate(p.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{p.note ?? ""}</span>
                  <span className="tabular font-bold">{formatCents(p.amountCents)}</span>
                  <UndoDelete
                    onDelete={() => deleteReservePurchase(p.id)}
                    onRestore={restoreReservePurchase}
                    message={t("Kauf gelöscht")}
                    label={t("Kauf löschen")}
                    className="icon-btn h-8 w-8 text-subtle hover:bg-bad/10 hover:text-bad"
                    iconSize={14}
                  />
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={addReservePurchase} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input type="hidden" name="itemId" value={item.id} />
            <input name="date" type="date" className="input" defaultValue={today()} aria-label={t("Datum des Kaufs")} required />
            <input name="amount" className="input tabular" inputMode="decimal" placeholder={t("Betrag €")} aria-label={t("Betrag in Euro")} required />
            <SubmitButton className="btn col-span-2 sm:col-span-1"><Plus size={16} />{" "}{t("Kauf")}</SubmitButton>
          </ActionForm>
        </div>
      )}
    </section>
  );
}
