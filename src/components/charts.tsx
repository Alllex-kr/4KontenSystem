"use client";

import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const compactEur = (v: number) => (Math.abs(v) >= 10000 ? `${Math.round(v / 1000)} T€` : eur.format(v));
const tipEur = (v: unknown) => eur2.format(Number(v));

/** Liest die aktuellen Theme-Farben aus den CSS-Variablen (für SVG-Attribute in Recharts). */
function useChartTheme() {
  const read = () => {
    if (typeof window === "undefined") return { grid: "#e3e8e1", axis: "#8b998f", surface: "#ffffff", fg: "#12201a", line: "#e3e8e1", animate: true };
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
    return {
      grid: v("--line", "#e3e8e1"),
      axis: v("--subtle", "#8b998f"),
      surface: v("--surface", "#ffffff"),
      fg: v("--fg", "#12201a"),
      line: v("--line-strong", "#cbd3c8"),
      animate: !prefersReducedMotion(),
    };
  };
  const [t, setT] = useState(read);
  useEffect(() => {
    const update = () => setT(read());
    update();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    window.addEventListener("appearancechange", update);
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-motion"] });
    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("appearancechange", update);
      obs.disconnect();
    };
  }, []);
  return t;
}

/** Kleinere Diagramme auf dem Handy. */
function useCompact() {
  const [c, setC] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const u = () => setC(mq.matches);
    u();
    mq.addEventListener("change", u);
    return () => mq.removeEventListener("change", u);
  }, []);
  return c;
}

function useCommon() {
  const t = useChartTheme();
  const compact = useCompact();
  const axis = { fontSize: compact ? 10 : 12, fill: t.axis };
  const tooltip = {
    contentStyle: { background: t.surface, border: `1px solid ${t.line}`, borderRadius: 12, color: t.fg, fontSize: 13, boxShadow: "0 8px 24px -8px rgb(0 0 0 / 0.25)" },
    itemStyle: { color: t.fg },
    labelStyle: { color: t.fg, fontWeight: 700 },
    cursor: { fill: t.grid, opacity: 0.5 },
  };
  return { t, compact, axis, tooltip, yWidth: compact ? 48 : 72 };
}

export type Slice = { name: string; value: number; color: string };

/** Ringdiagramm, Werte in Euro. */
export function DonutChart({ data, centerLabel, centerValue, height = 240 }: { data: Slice[]; centerLabel?: string; centerValue?: string; height?: number }) {
  const { t, tooltip } = useCommon();
  const visible = data.filter((d) => d.value > 0);
  if (!visible.length) return <Empty />;
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={visible} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="92%" paddingAngle={2} stroke={t.surface} strokeWidth={2} cornerRadius={6} isAnimationActive={t.animate} animationBegin={150} animationDuration={900} animationEasing="ease-out">
            {visible.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip formatter={tipEur} {...tooltip} />
        </PieChart>
      </ResponsiveContainer>
      {centerValue && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted">{centerLabel}</span>
          <span className="tabular text-lg font-black">{centerValue}</span>
        </div>
      )}
    </div>
  );
}

export function Legendary({ data }: { data: Slice[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <ul className="stagger mt-3 space-y-1.5 text-sm">
      {data.map((d) => (
        <li key={d.name} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
          <span className="min-w-0 flex-1 truncate">{d.name}</span>
          <span className="tabular text-muted">{Math.round((d.value / total) * 100)} %</span>
          <span className="tabular w-24 text-right font-bold">{eur2.format(d.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Tagesprognose des Fixkostenkontos mit Mindestpuffer-Linie. */
export function ForecastChart({ data, buffer, color = "#3b82f6" }: { data: { label: string; balance: number }[]; buffer: number; color?: string }) {
  const { t, axis, tooltip, yWidth, compact } = useCommon();
  return (
    <div className={compact ? "h-56" : "h-72"}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="fc" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
          <XAxis dataKey="label" tick={axis} interval="preserveStartEnd" minTickGap={compact ? 32 : 24} stroke={t.grid} />
          <YAxis tick={axis} tickFormatter={compactEur} width={yWidth} stroke={t.grid} />
          <Tooltip formatter={tipEur} labelFormatter={(l) => `Datum: ${l}`} {...tooltip} cursor={{ stroke: t.line }} />
          <ReferenceLine y={buffer} ifOverflow="extendDomain" stroke="#ef4444" strokeDasharray="6 4" label={{ value: "Mindestpuffer", fill: "#ef4444", fontSize: 11, position: "insideTopRight" }} />
          <Area type="stepAfter" dataKey="balance" name="Kontostand" stroke={color} strokeWidth={2.5} fill="url(#fc)" isAnimationActive={t.animate} animationDuration={1100} animationEasing="ease-out" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Gestapelte Prognose der Kontostände über Monate. */
export function ProjectionChart({ data, colors, labels }: { data: Record<string, number | string>[]; colors: Record<string, string>; labels: Record<string, string> }) {
  const { t, axis, tooltip, yWidth, compact } = useCommon();
  const keys = ["NOTGROSCHEN", "SPAREN"];
  return (
    <div className={compact ? "h-56" : "h-72"}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
          <XAxis dataKey="label" tick={axis} stroke={t.grid} minTickGap={16} />
          <YAxis tick={axis} tickFormatter={compactEur} width={yWidth} stroke={t.grid} />
          <Tooltip formatter={tipEur} {...tooltip} cursor={{ stroke: t.line }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {keys.map((k) => (
            <Area key={k} type="monotone" dataKey={k} name={labels[k]} stackId="1" stroke={colors[k]} strokeWidth={2} fill={colors[k]} fillOpacity={0.3} isAnimationActive={t.animate} animationDuration={1100} animationEasing="ease-out" />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Gruppierte/gestapelte Balken. series: [{key,name,color}] */
export function BarsChart({
  data,
  series,
  stacked = false,
  xKey = "label",
  height = 288,
}: {
  data: Record<string, number | string>[];
  series: { key: string; name: string; color: string }[];
  stacked?: boolean;
  xKey?: string;
  height?: number;
}) {
  const { t, axis, tooltip, yWidth, compact } = useCommon();
  if (!data.length) return <Empty />;
  return (
    <div style={{ height: compact ? Math.min(height, 240) : height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
          <XAxis dataKey={xKey} tick={axis} stroke={t.grid} minTickGap={8} />
          <YAxis tick={axis} tickFormatter={compactEur} width={yWidth} stroke={t.grid} />
          <Tooltip formatter={tipEur} {...tooltip} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color}
              stackId={stacked ? "a" : undefined}
              radius={stacked ? (i === series.length - 1 ? [6, 6, 0, 0] : 0) : [6, 6, 0, 0]}
              maxBarSize={44}
              isAnimationActive={t.animate}
              animationBegin={i * 120}
              animationDuration={800}
              animationEasing="ease-out"
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Jahresverlauf der Rücklage. */
export function ReserveChart({ data }: { data: { label: string; reserve: number; due: number }[] }) {
  const { t, axis, tooltip, yWidth, compact } = useCommon();
  return (
    <div className={compact ? "h-56" : "h-72"}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
          <XAxis dataKey="label" tick={axis} stroke={t.grid} />
          <YAxis tick={axis} tickFormatter={compactEur} width={yWidth} stroke={t.grid} />
          <Tooltip formatter={tipEur} {...tooltip} cursor={{ stroke: t.line }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="reserve" name="Rücklage" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={t.animate} animationDuration={1100} animationEasing="ease-out" />
          <Line type="monotone" dataKey="due" name="Fällige Zahlungen" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} isAnimationActive={t.animate} animationDuration={1100} animationEasing="ease-out" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Fortschrittsringe, value 0–100 (eigene SVG-Ringe). */
export function RadialProgress({ data }: { data: { name: string; value: number; fill: string }[] }) {
  if (!data.length) return <Empty />;
  const size = 200;
  const stroke = 14;
  const gap = 6;
  return (
    <div className="flex flex-col items-center gap-6 @md:flex-row @md:justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Fortschritt der Sparziele">
        {data.slice(0, 5).map((d, i) => {
          const r = size / 2 - stroke / 2 - i * (stroke + gap);
          const c = 2 * Math.PI * r;
          const pct = Math.max(0, Math.min(100, d.value));
          return (
            <g key={d.name} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" style={{ stroke: "var(--surface-2)" }} strokeWidth={stroke} />
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.fill} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c} ${c}`} strokeDashoffset={c - (pct / 100) * c} className="ring-fill" style={{ ["--c" as string]: `${c}`, animationDelay: `${150 + i * 120}ms` }}>
                <title>{`${d.name}: ${Math.round(pct)} %`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
      <ul className="space-y-2 text-sm">
        {data.slice(0, 5).map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.fill }} />
            <span>{d.name}</span>
            <span className="tabular font-bold">{Math.round(d.value)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Empty() {
  return <div className="flex h-40 items-center justify-center text-sm text-subtle">Noch keine Daten</div>;
}
