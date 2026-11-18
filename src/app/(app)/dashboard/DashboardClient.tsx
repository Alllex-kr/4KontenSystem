"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  EyeOff,
  GripVertical,
  LayoutGrid,
  Plus,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Wallet,
  PiggyBank,
  PartyPopper,
} from "lucide-react";
import { loadDemoData, saveDashboardLayout } from "@/actions/finance";
import { ACCOUNT_META, type AccountKind } from "@/lib/constants";
import { formatCents } from "@/lib/format";
import { PRESETS, WIDGETS, presetLayout, type PresetId, type WidgetConfig, type WidgetId, type WidgetSize } from "@/lib/dashboard";
import type { AccountLite } from "@/lib/data";
import { Alert, Card, EmptyState, ProgressBar, Stat } from "@/components/ui";
import { BarsChart, DonutChart, ForecastChart, Legendary, ProjectionChart, type Slice } from "@/components/charts";
import { QuickAdd } from "@/components/QuickAdd";
import { LogoMark } from "@/components/brand/Logo";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { AusgleichPanel, TodoList, TransfersPanel, type AccountInfo } from "@/components/planning/PlanningWidgets";
import type { Ausgleich, Todo, TransferSuggestion } from "@/lib/planning";

export type DashboardData = {
  firstName: string;
  today: string;
  hour: number;
  isEmpty: boolean;
  showWelcome: boolean;
  total: number;
  incomeCents: number;
  fixedTotalCents: number;
  freizeitBudget: number;
  freizeitSpent: number;
  daysLeft: number;
  daysInMonth: number;
  savingsCents: number;
  minBufferCents: number;
  transferDay: number;
  warnings: string[];
  bufferWarning: { date: string; cents: number } | null;
  emergency: { targetCents: number; reached: boolean; monthsTo: number | null };
  sparenIn12Cents: number;
  accounts: { id: string; kind: AccountKind; name: string; color: string; balanceCents: number; monthlyCents: number }[];
  colors: Record<AccountKind, string>;
  names: Record<AccountKind, string>;
  forecast: { label: string; balance: number }[];
  projection: Record<string, number | string>[];
  cashflow: Record<string, number | string>[];
  categories: Slice[];
  goals: { id: string; name: string; savedCents: number; targetCents: number }[];
  recent: { id: string; description: string; date: string; accountName: string; accountKind: AccountKind; category: string; amountCents: number }[];
  kinds: AccountKind[];
  reserveCents: number;
  reserveAccountKind: "SPAREN" | "NOTGROSCHEN";
  todos: Todo[];
  transfersSuggested: TransferSuggestion[];
  uncovered: { to: AccountKind; amountCents: number; reason: string }[];
  ausgleich: Ausgleich;
  suggestedSource: AccountKind | null;
  accountInfo: AccountInfo;
};

// Feste Klassen, damit Tailwind sie erkennt
const SIZE_CLASS: Record<WidgetSize, string> = {
  sm: "fold:col-span-3 xl:col-span-4",
  md: "fold:col-span-3 xl:col-span-6",
  lg: "fold:col-span-6 xl:col-span-8",
  full: "fold:col-span-6 xl:col-span-12",
};
const SIZE_LABEL: Record<WidgetSize, string> = { sm: "S", md: "M", lg: "L", full: "XL" };
const SIZE_TITLE: Record<WidgetSize, string> = { sm: "Klein (ein Drittel)", md: "Mittel (halbe Breite)", lg: "Groß (zwei Drittel)", full: "Volle Breite" };

function greeting(hour: number) {
  if (hour < 5) return "Gute Nacht";
  if (hour < 11) return "Guten Morgen";
  if (hour < 18) return "Hallo";
  return "Guten Abend";
}

export function DashboardClient({
  data,
  initialLayout,
  accounts,
  canCustomize = true,
  exclude = [],
}: {
  data: DashboardData;
  initialLayout: WidgetConfig[];
  accounts: AccountLite[];
  /** Berechtigung "customize.use" */
  canCustomize?: boolean;
  /** Widgets, deren Funktion im Abo fehlt */
  exclude?: WidgetId[];
}) {
  const [layout, setLayout] = useState(initialLayout);
  const [saved, setSaved] = useState(initialLayout);
  const [editing, setEditing] = useState(false);
  const [activeId, setActiveId] = useState<WidgetId | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const allowed = layout.filter((w) => !exclude.includes(w.id));
  const visible = allowed.filter((w) => w.visible);
  const hidden = allowed.filter((w) => !w.visible);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const update = (id: WidgetId, patch: Partial<WidgetConfig>) => setLayout((l) => l.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const move = (id: WidgetId, dir: -1 | 1) =>
    setLayout((l) => {
      const vis = l.filter((w) => w.visible);
      const i = vis.findIndex((w) => w.id === id);
      const j = i + dir;
      if (j < 0 || j >= vis.length) return l;
      const a = l.findIndex((w) => w.id === vis[i].id);
      const b = l.findIndex((w) => w.id === vis[j].id);
      return arrayMove(l, a, b);
    });

  const onDragStart = (e: DragStartEvent) => setActiveId(e.active.id as WidgetId);
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setLayout((l) => arrayMove(l, l.findIndex((w) => w.id === active.id), l.findIndex((w) => w.id === over.id)));
  };

  const finish = () => {
    startTransition(async () => {
      const res = await saveDashboardLayout(layout);
      if (res?.error) {
        setToast(res.error);
      } else {
        setSaved(layout);
        setEditing(false);
        setToast("Dashboard gespeichert 🍀");
      }
      setTimeout(() => setToast(null), 2500);
    });
  };
  const cancel = () => {
    setLayout(saved);
    setEditing(false);
  };

  return (
    <div className="space-y-5">
      {/* Kopfzeile */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted">{data.today}</p>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            {greeting(data.hour)}, {data.firstName}! <span aria-hidden className="inline-block animate-pop [animation-delay:300ms]">🍀</span>
          </h1>
        </div>
        {!editing && canCustomize && (
          <button onClick={() => setEditing(true)} className="btn-ghost shrink-0 px-3" aria-label="Dashboard anpassen">
            <LayoutGrid size={17} /> <span className="hidden sm:inline">Dashboard anpassen</span>
          </button>
        )}
      </div>

      {/* Bearbeitungsleiste */}
      {editing && (
        <div className="animate-fade-down animate-edit sticky top-[calc(3.5rem+var(--safe-top))] z-20 rounded-2xl border border-accent/40 bg-surface p-3 shadow-lg lg:top-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-sm font-semibold">
              <span className="text-accent">Bearbeiten:</span> Am Griff <GripVertical size={14} className="inline" /> ziehen, Größe wählen oder ausblenden.
            </p>
            <button onClick={cancel} className="btn-ghost">Abbrechen</button>
            <button onClick={finish} className="btn" disabled={pending}>
              <Check size={17} /> {pending ? "Speichern …" : "Fertig"}
            </button>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            <span className="self-center text-xs font-bold uppercase tracking-wide text-muted">Vorlagen:</span>
            {(Object.keys(PRESETS) as PresetId[]).map((p) => (
              <button key={p} onClick={() => setLayout(presetLayout(p))} className="chip" title={PRESETS[p].description}>
                {PRESETS[p].label}
              </button>
            ))}
            <button onClick={() => setLayout(presetLayout("standard"))} className="chip">
              <RotateCcw size={14} /> Zurücksetzen
            </button>
          </div>
        </div>
      )}

      {/* Hinweise */}
      {!editing && (
        <>
          {data.showWelcome && data.isEmpty && (
            <Alert tone="info">
              Willkommen bei Vierklee! Deine vier Konten sind angelegt. Trag als Nächstes Einkommen und Fixkosten unter{" "}
              <Link href="/zahlungen" className="font-bold underline">Fixe Zahlungen</Link> ein, oder probier alles mit Beispieldaten aus.
            </Alert>
          )}
          {data.isEmpty && (
            <EmptyState icon={<LogoMark size={48} />} title="Noch keine Daten" text="Lade ein typisches Studi-Budget als Beispiel, um alle Diagramme zu sehen. Du kannst es später jederzeit ersetzen.">
              <form action={loadDemoData}>
                <button className="btn"><Sparkles size={16} /> Beispieldaten laden</button>
              </form>
            </EmptyState>
          )}
          {data.warnings.map((w) => (
            <Alert key={w}><AlertTriangle size={16} className="mr-2 inline" />{w}</Alert>
          ))}
          {data.bufferWarning && (
            <Alert>
              <AlertTriangle size={16} className="mr-2 inline" />
              Dein Fixkostenkonto fällt am {data.bufferWarning.date} voraussichtlich auf {formatCents(data.bufferWarning.cents)}, also unter den Mindestpuffer von{" "}
              {formatCents(data.minBufferCents)}. Zahl rechtzeitig etwas ein.
            </Alert>
          )}
        </>
      )}

      {/* Widgets */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <SortableContext items={visible.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div className="dash-grid stagger">
            {visible.map((w, i) => (
              <SortableWidget
                key={w.id}
                config={w}
                editing={editing}
                isFirst={i === 0}
                isLast={i === visible.length - 1}
                onSize={(size) => update(w.id, { size })}
                onHide={() => update(w.id, { visible: false })}
                onMove={(d) => move(w.id, d)}
              >
                <Widget id={w.id} data={data} accounts={accounts} />
              </SortableWidget>
            ))}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeId ? (
            <div className="card flex items-center gap-2 border-accent font-bold shadow-2xl" style={{ scale: "1.04", rotate: "1.5deg", cursor: "grabbing" }}>
              <GripVertical size={18} className="text-accent" /> {WIDGETS[activeId].title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {editing && visible.length === 0 && <EmptyState title="Alle Widgets ausgeblendet" text="Füge unten Widgets hinzu oder wähle eine Vorlage." />}

      {/* Ausgeblendete Widgets */}
      {editing && hidden.length > 0 && (
        <section className="animate-fade-up rounded-2xl border border-dashed border-line-strong p-4">
          <h2 className="font-bold">Weitere Widgets</h2>
          <p className="text-xs text-muted">Tippe auf ein Widget, um es zum Dashboard hinzuzufügen.</p>
          <div className="stagger mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {hidden.map((w) => (
              <button
                key={w.id}
                onClick={() => setLayout((l) => [...l.filter((x) => x.id !== w.id), { ...w, visible: true }])}
                className="card-interactive flex items-start gap-3 rounded-xl border border-line bg-surface p-3 text-left hover:border-accent hover:bg-accent-soft"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><Plus size={16} /></span>
                <span>
                  <span className="block text-sm font-bold">{WIDGETS[w.id].title}</span>
                  <span className="block text-xs text-muted">{WIDGETS[w.id].description}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {toast && (
        <div className="animate-fade fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-8" role="status">
          <span className="animate-toast rounded-full bg-fg px-4 py-2 text-sm font-bold text-bg shadow-lg">{toast}</span>
        </div>
      )}
    </div>
  );
}

function SortableWidget({
  config,
  editing,
  isFirst,
  isLast,
  onSize,
  onHide,
  onMove,
  children,
}: {
  config: WidgetConfig;
  editing: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSize: (s: WidgetSize) => void;
  onHide: () => void;
  onMove: (d: -1 | 1) => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: config.id, disabled: !editing });
  const style = { transform: CSS.Translate.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={`@container relative min-w-0 ${SIZE_CLASS[config.size]} ${isDragging ? "z-10 opacity-40" : ""}`}>
      {editing && (
        <div className="animate-fade-down mb-2 flex items-center gap-1 rounded-xl border border-accent/40 bg-accent-soft p-1">
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className="icon-btn cursor-grab touch-none text-accent active:cursor-grabbing"
            aria-label={`${WIDGETS[config.id].title} verschieben`}
          >
            <GripVertical size={18} />
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-bold">{WIDGETS[config.id].title}</span>
          <div className="hidden rounded-lg bg-surface p-0.5 fold:flex" role="group" aria-label="Größe">
            {(Object.keys(SIZE_LABEL) as WidgetSize[]).map((s) => (
              <button
                key={s}
                onClick={() => onSize(s)}
                title={SIZE_TITLE[s]}
                aria-pressed={config.size === s}
                className={`h-8 min-w-8 rounded-md px-1.5 text-xs font-black transition duration-200 active:scale-90 ${config.size === s ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"}`}
              >
                {SIZE_LABEL[s]}
              </button>
            ))}
          </div>
          <button onClick={() => onMove(-1)} disabled={isFirst} className="icon-btn disabled:opacity-30" aria-label="Nach oben">
            <ArrowUp size={17} />
          </button>
          <button onClick={() => onMove(1)} disabled={isLast} className="icon-btn disabled:opacity-30" aria-label="Nach unten">
            <ArrowDown size={17} />
          </button>
          <button onClick={onHide} className="icon-btn hover:text-bad" aria-label="Ausblenden">
            <EyeOff size={17} />
          </button>
        </div>
      )}
      <div className={editing ? "pointer-events-none select-none" : ""}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Einzelne Widgets                                                   */
/* ------------------------------------------------------------------ */

function Widget({ id, data, accounts }: { id: WidgetId; data: DashboardData; accounts: AccountLite[] }) {
  const t = WIDGETS[id];
  switch (id) {
    case "todos":
      return (
        <Card title={t.title} subtitle={data.todos.length ? `${data.todos.length} offen` : undefined}>
          <TodoList todos={data.todos} transfers={data.transfersSuggested} accounts={data.accountInfo} compact />
        </Card>
      );

    case "ausgleich":
      return (
        <Card title={t.title} subtitle="Hält das Fixkostenkonto den Mindestpuffer? (Excel: Puffer & Ausgleichszahlung)">
          <AusgleichPanel ausgleich={data.ausgleich} minBufferCents={data.minBufferCents} accounts={data.accountInfo} suggestedSource={data.suggestedSource} />
          {(data.transfersSuggested.length > 0 || data.uncovered.length > 0) && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-2 text-sm font-bold">Notwendige Überweisungen</p>
              <TransfersPanel transfers={data.transfersSuggested} uncovered={data.uncovered} accounts={data.accountInfo} />
            </div>
          )}
        </Card>
      );

    case "kpis":
      return (
        <div className="grid grid-cols-2 gap-3 @4xl:grid-cols-4">
          <Stat icon={<Wallet size={14} />} label="Gesamtvermögen" cents={data.total} hint="Summe aller vier Konten" />
          <Stat icon={<TrendingUp size={14} />} label="Einkommen / Monat" cents={data.incomeCents} hint={`Fixkosten: ${formatCents(data.fixedTotalCents)}`} />
          <Stat
            icon={<PartyPopper size={14} />}
            label="Freizeit übrig"
            cents={data.freizeitBudget - data.freizeitSpent}
            tone={data.freizeitBudget - data.freizeitSpent < 0 ? "bad" : "good"}
            hint={
              data.freizeitBudget - data.freizeitSpent > 0
                ? `≈ ${formatCents(Math.floor((data.freizeitBudget - data.freizeitSpent) / data.daysLeft))} pro Tag bis Monatsende`
                : "Budget für diesen Monat aufgebraucht"
            }
          />
          <Stat
            icon={<PiggyBank size={14} />}
            label="Sparrate / Monat"
            cents={data.savingsCents}
            hint={data.incomeCents ? `${Math.round((data.savingsCents / data.incomeCents) * 100)} % des Einkommens` : "–"}
          />
        </div>
      );

    case "accounts":
      return (
        <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2 @4xl:grid-cols-4">
          {data.accounts.map((a) => {
            const emergencyProgress = data.emergency.targetCents ? a.balanceCents / data.emergency.targetCents : 0;
            return (
              <Link key={a.id} href="/konten" className="card card-interactive group relative overflow-hidden">
                <div className="bar-grow absolute inset-x-0 top-0 h-1.5" style={{ background: a.color }} />
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />
                  <p className="text-sm font-bold text-muted">{a.name}</p>
                </div>
                <p className="tabular mt-1 text-2xl font-black"><AnimatedNumber cents={a.balanceCents} /></p>
                <p className="mt-1 text-xs text-muted">
                  {a.kind === "FIXKOSTEN" ? "Bedarf" : "Dauerauftrag"}: <span className="tabular font-bold text-fg">{formatCents(a.monthlyCents)}</span> / Monat
                </p>
                {a.kind === "NOTGROSCHEN" && (
                  <div className="mt-3">
                    <ProgressBar value={emergencyProgress} color={a.color} />
                    <p className="mt-1 text-xs text-muted">
                      {Math.round(emergencyProgress * 100)} % von <span className="tabular">{formatCents(data.emergency.targetCents)}</span>
                      {data.emergency.monthsTo ? ` · noch ca. ${data.emergency.monthsTo} Monate` : ""}
                    </p>
                  </div>
                )}
                {a.kind === "FREIZEIT" && (
                  <div className="mt-3">
                    <ProgressBar value={data.freizeitBudget ? data.freizeitSpent / data.freizeitBudget : 0} color={a.color} />
                    <p className="mt-1 text-xs text-muted"><span className="tabular">{formatCents(data.freizeitSpent)}</span> diesen Monat ausgegeben</p>
                  </div>
                )}
                {a.kind === "FIXKOSTEN" && (
                  <p className={`mt-3 text-xs font-semibold ${a.balanceCents < data.minBufferCents ? "text-bad" : "text-good"}`}>
                    Mindestpuffer {formatCents(data.minBufferCents)} {a.balanceCents < data.minBufferCents ? "unterschritten" : "eingehalten ✓"}
                  </p>
                )}
                {a.kind === "SPAREN" && <p className="mt-3 text-xs text-muted">In 12 Monaten: <span className="tabular font-bold text-fg">{formatCents(data.sparenIn12Cents)}</span></p>}
              </Link>
            );
          })}
        </div>
      );

    case "freizeit": {
      const left = data.freizeitBudget - data.freizeitSpent;
      const pct = data.freizeitBudget ? Math.min(1, Math.max(0, data.freizeitSpent / data.freizeitBudget)) : 0;
      const monthPct = (data.daysInMonth - data.daysLeft + 1) / data.daysInMonth;
      const color = data.colors.FREIZEIT;
      const r = 52;
      const c = 2 * Math.PI * r;
      return (
        <Card title={t.title} subtitle={`Noch ${data.daysLeft} Tage in diesem Monat`}>
          <div className="flex flex-col items-center gap-4 @sm:flex-row">
            <svg width="132" height="132" viewBox="0 0 132 132" className="shrink-0" aria-hidden>
              <circle cx="66" cy="66" r={r} fill="none" strokeWidth="14" style={{ stroke: "var(--surface-2)" }} />
              <circle
                cx="66"
                cy="66"
                r={r}
                fill="none"
                stroke={color}
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${c} ${c}`}
                strokeDashoffset={pct * c}
                transform="rotate(-90 66 66)"
                className="ring-fill"
                style={{ ["--c" as string]: `${c}`, transition: "stroke-dashoffset 900ms var(--ease-out)" }}
              />
              <text x="66" y="62" textAnchor="middle" className="fill-current text-[11px] font-bold" style={{ fill: "var(--muted)" }}>übrig</text>
              <text x="66" y="82" textAnchor="middle" className="text-[18px] font-black" style={{ fill: "var(--fg)" }}>{Math.round((1 - pct) * 100)} %</text>
            </svg>
            <div className="w-full text-center @sm:text-left">
              <p className={`tabular text-3xl font-black ${left < 0 ? "text-bad" : ""}`}><AnimatedNumber cents={left} /></p>
              <p className="text-sm text-muted">von <span className="tabular">{formatCents(data.freizeitBudget)}</span> übrig</p>
              {left > 0 && <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-sm font-semibold">≈ <span className="tabular">{formatCents(Math.floor(left / data.daysLeft))}</span> pro Tag</p>}
              <p className="mt-2 text-xs text-muted">
                {pct > monthPct + 0.1 ? "Du gibst gerade schneller aus als geplant." : "Du liegst gut im Plan. 👌"}
              </p>
            </div>
          </div>
        </Card>
      );
    }

    case "quickadd":
      return (
        <Card title={t.title} subtitle="Ausgabe in Sekunden eintragen">
          <QuickAdd accounts={accounts} compact />
        </Card>
      );

    case "allocation": {
      const monthlyOf = (k: AccountKind) => (data.accounts.find((a) => a.kind === k)?.monthlyCents ?? 0) - (k === data.reserveAccountKind ? data.reserveCents : 0);
      const slices: Slice[] = [
        ...(["FIXKOSTEN"] as AccountKind[]).map((k) => ({ name: data.names[k], value: monthlyOf(k) / 100, color: data.colors[k] })),
        ...(data.reserveCents > 0 ? [{ name: "Rücklagen", value: data.reserveCents / 100, color: "#14b8a6" }] : []),
        ...(["NOTGROSCHEN", "SPAREN", "FREIZEIT"] as AccountKind[]).map((k) => ({ name: data.names[k], value: monthlyOf(k) / 100, color: data.colors[k] })),
      ];
      return (
        <Card title={t.title} subtitle="So wird dein Einkommen aufgeteilt">
          <DonutChart data={slices} centerLabel="Einkommen" centerValue={formatCents(data.incomeCents)} />
          <Legendary data={slices} />
        </Card>
      );
    }

    case "forecast":
      return (
        <Card title={t.title} subtitle="Prognose für 60 Tage mit allen fixen Zahlungen und Daueraufträgen">
          <ForecastChart data={data.forecast} buffer={data.minBufferCents / 100} color={data.colors.FIXKOSTEN} />
        </Card>
      );

    case "projection":
      return (
        <Card title={t.title} subtitle="Sparen und Notgroschen in 12 Monaten, wenn du dranbleibst">
          <ProjectionChart data={data.projection} colors={data.colors} labels={data.names} />
        </Card>
      );

    case "balances": {
      const slices = data.accounts.map((a) => ({ name: a.name, value: Math.max(0, a.balanceCents) / 100, color: a.color }));
      return (
        <Card title={t.title} subtitle="Aktuelle Kontostände">
          <DonutChart data={slices} centerLabel="Gesamt" centerValue={formatCents(data.total)} />
          <Legendary data={slices} />
        </Card>
      );
    }

    case "cashflow":
      return (
        <Card title={t.title} subtitle="Gebuchte Beträge der letzten 6 Monate (ohne Umbuchungen)">
          <BarsChart data={data.cashflow} series={[{ key: "Einnahmen", name: "Einnahmen", color: "#10b981" }, { key: "Ausgaben", name: "Ausgaben", color: "#ef4444" }]} />
        </Card>
      );

    case "categories":
      return (
        <Card title={t.title} subtitle="Dieser Monat">
          <DonutChart data={data.categories} />
          <Legendary data={data.categories.slice(0, 6)} />
        </Card>
      );

    case "transfers":
      return (
        <Card title={t.title} subtitle={`Empfehlung: jeweils am ${data.transferDay}. des Monats vom Fixkostenkonto`}>
          <ul className="divide-y divide-line text-sm">
            {(["NOTGROSCHEN", "SPAREN", "FREIZEIT"] as AccountKind[]).map((k) => (
              <li key={k} className="flex items-center justify-between gap-2 py-2.5">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: data.colors[k] }} />
                  <span className="truncate">{ACCOUNT_META.FIXKOSTEN.short}</span>
                  <ArrowRight size={14} className="shrink-0 text-subtle" />
                  <span className="truncate font-semibold">{data.names[k]}</span>
                </span>
                <span className="tabular font-black">{formatCents(data.accounts.find((a) => a.kind === k)?.monthlyCents ?? 0)}</span>
              </li>
            ))}
          </ul>
          {data.emergency.reached && data.emergency.targetCents > 0 && (
            <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-good"><CheckCircle2 size={16} /> Notgroschen voll! Der Anteil geht jetzt in Freizeit &amp; Sparen.</p>
          )}
        </Card>
      );

    case "goals":
      return (
        <Card title={t.title} action={<Link href="/ziele" className="text-sm font-bold text-accent">Alle</Link>}>
          {data.goals.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Sparziele. <Link className="font-bold text-accent" href="/ziele">Jetzt anlegen</Link></p>
          ) : (
            <ul className="space-y-4">
              {data.goals.slice(0, 4).map((g) => (
                <li key={g.id}>
                  <div className="mb-1 flex justify-between gap-2 text-sm">
                    <span className="truncate font-semibold">{g.name}</span>
                    <span className="tabular shrink-0 text-muted">{formatCents(g.savedCents)} / {formatCents(g.targetCents)}</span>
                  </div>
                  <ProgressBar value={g.savedCents / g.targetCents} color={data.colors.SPAREN} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      );

    case "recent":
      return (
        <Card title={t.title} action={<Link href="/transaktionen" className="text-sm font-bold text-accent">Alle</Link>}>
          {data.recent.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Buchungen. Tippe auf <b>+</b>, um die erste einzutragen.</p>
          ) : (
            <ul className="stagger divide-y divide-line text-sm @3xl:grid @3xl:grid-cols-2 @3xl:gap-x-8 @3xl:divide-y-0">
              {data.recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 @3xl:border-b @3xl:border-line">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: data.colors[r.accountKind] }} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{r.description}</span>
                      <span className="block truncate text-xs text-muted">{r.date} · {r.accountName} · {r.category}</span>
                    </span>
                  </span>
                  <span className={`tabular shrink-0 font-black ${r.amountCents < 0 ? "text-bad" : "text-good"}`}>{formatCents(r.amountCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      );
  }
}
