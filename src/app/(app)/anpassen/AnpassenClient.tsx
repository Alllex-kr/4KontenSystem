"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Check, Eye, EyeOff, LayoutGrid, Monitor, Moon, RotateCcw, Sparkles, Sun, Type, ZapOff } from "lucide-react";
import { saveAppearance, saveDashboardLayout, updateAccountAppearance } from "@/actions/finance";
import { ACCENTS, ACCOUNT_COLOR_CHOICES, applyAppearance, type Accent, type Appearance, type FontScale, type Motion, type Theme } from "@/lib/appearance";
import { ACCOUNT_META, type AccountKind } from "@/lib/constants";
import { PRESETS, presetLayout, type PresetId } from "@/lib/dashboard";
import type { AccountLite } from "@/lib/data";
import { Card } from "@/components/ui";
import { centerOf, deviceReducesMotion, softColorTransition, themeTransition } from "@/lib/motion";
import { LogoMark } from "@/components/brand/Logo";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";
import { rich } from "@/lib/i18n/rich";

const THEME_OPTIONS: { v: Theme; label: string; icon: typeof Sun; preview: [string, string, string] }[] = [
  { v: "system", label: msg("Wie System"), icon: Monitor, preview: ["#f6f8f5", "#0c1310", "#cbd3c8"] },
  { v: "light", label: msg("Hell"), icon: Sun, preview: ["#f6f8f5", "#ffffff", "#e3e8e1"] },
  { v: "dark", label: msg("Dunkel"), icon: Moon, preview: ["#0c1310", "#131c18", "#24322b"] },
];

export function AnpassenClient({ appearance, accounts }: { appearance: Appearance; accounts: AccountLite[] }) {
  const t = useT();
  const [a, setA] = useState(appearance);
  const [deviceReduced, setDeviceReduced] = useState(false);
  useEffect(() => setDeviceReduced(deviceReducesMotion()), []);
  const [saved, setSaved] = useState<string | null>(null);
  const [, start] = useTransition();

  const flash = (text = t("Gespeichert ✓")) => {
    setSaved(text);
    setTimeout(() => setSaved(null), 1500);
  };

  const set = <K extends keyof Appearance>(key: K, value: Appearance[K], e?: React.MouseEvent) => {
    setA((prev) => ({ ...prev, [key]: value }));
    const apply = () => applyAppearance({ [key]: value });
    if (key === "theme") themeTransition(apply, e ? centerOf(e) : undefined);
    else if (key === "accent" || key === "fontScale") softColorTransition(apply);
    else apply();
    start(async () => {
      await saveAppearance({ [key]: value });
      flash();
    });
  };

  return (
    <div className="stagger space-y-6">
      <Card title={t("Farbschema")} subtitle={t("Hell, dunkel oder automatisch wie dein Gerät")}>
        <div className="grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map(({ v, label, icon: Icon, preview }) => (
            <button
              key={v}
              onClick={(e) => set("theme", v, e)}
              aria-pressed={a.theme === v}
              className={`rounded-2xl border-2 p-2 text-left transition duration-300 active:scale-[0.97] ${a.theme === v ? "border-accent" : "border-line hover:border-line-strong"}`}
            >
              <div className="relative h-16 overflow-hidden rounded-xl sm:h-20" style={{ background: v === "system" ? `linear-gradient(135deg, ${preview[0]} 50%, ${preview[1]} 50%)` : preview[0] }}>
                <div className="absolute left-2 top-2 h-3 w-10 rounded-full" style={{ background: preview[2] }} />
                <div className="absolute bottom-2 left-2 right-2 h-6 rounded-lg sm:h-8" style={{ background: v === "system" ? preview[2] : preview[1], border: `1px solid ${preview[2]}` }} />
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-sm font-bold">
                <Icon size={15} /> {t(label)}
              </p>
            </button>
          ))}
        </div>
      </Card>

      <Card title={t("Akzentfarbe")} subtitle={t("Für Buttons, Links und Hervorhebungen")}>
        <div className="flex flex-wrap gap-3">
          {(Object.keys(ACCENTS) as Accent[]).map((k) => (
            <button
              key={k}
              onClick={() => set("accent", k)}
              aria-pressed={a.accent === k}
              aria-label={t(ACCENTS[k].label)}
              title={t(ACCENTS[k].label)}
              className="group flex flex-col items-center gap-1.5"
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-2xl text-white ring-offset-2 ring-offset-surface transition group-hover:scale-105 ${a.accent === k ? "ring-2" : ""}`}
                style={{ background: ACCENTS[k].color, ["--tw-ring-color" as string]: ACCENTS[k].color }}
              >
                {a.accent === k && <Check size={22} strokeWidth={3} className="animate-pop" />}
              </span>
              <span className="text-xs font-semibold text-muted">{t(ACCENTS[k].label).replace(/\s*\(.*\)$/, "")}</span>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title={t("Schriftgröße")} subtitle={t("Größere Schrift für bessere Lesbarkeit")}>
          <div className="grid grid-cols-2 gap-2">
            {(["normal", "large"] as FontScale[]).map((f) => (
              <button
                key={f}
                onClick={() => set("fontScale", f)}
                aria-pressed={a.fontScale === f}
                className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 font-bold transition ${a.fontScale === f ? "border-accent bg-accent-soft text-accent" : "border-line"}`}
              >
                <Type size={f === "large" ? 22 : 16} /> {f === "normal" ? t("Normal") : t("Groß")}
              </button>
            ))}
          </div>
        </Card>

        <Card title={t("Privatsphäre")} subtitle={t("Beträge unscharf machen, z. B. in der Bahn oder Vorlesung")}>
          <button
            onClick={() => set("hideAmounts", !a.hideAmounts)}
            role="switch"
            aria-checked={a.hideAmounts}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-line p-3 text-left"
          >
            <span className="flex items-center gap-3">
              {a.hideAmounts ? <EyeOff size={20} className="text-accent" /> : <Eye size={20} className="text-muted" />}
              <span>
                <span className="block text-sm font-bold">{t("Beträge verbergen")}</span>
                <span className="tabular block text-xs text-muted">{t("Vorschau: 1.234,56 €")}</span>
              </span>
            </span>
            <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${a.hideAmounts ? "bg-accent" : "bg-line-strong"}`}>
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all duration-300 ease-[var(--ease-spring)] ${a.hideAmounts ? "left-6" : "left-1"}`} />
            </span>
          </button>
          <p className="mt-2 text-xs text-muted">{t("Auch über das Auge-Symbol oben erreichbar.")}</p>
        </Card>
      </div>

      <Card title={t("Animationen")} subtitle={t("Weiche Übergänge, hochzählende Beträge und kleine Effekte")}>
        <div className="grid grid-cols-3 gap-2">
          {([
            { v: "system", label: msg("Automatisch"), icon: Monitor },
            { v: "on", label: msg("Immer an"), icon: Sparkles },
            { v: "off", label: msg("Aus"), icon: ZapOff },
          ] as { v: Motion; label: string; icon: typeof Sun }[]).map(({ v, label, icon: Icon }) => (
            <button
              key={v}
              onClick={() => set("motion", v)}
              aria-pressed={a.motion === v}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border-2 text-sm font-bold transition duration-300 active:scale-[0.97] ${a.motion === v ? "border-accent bg-accent-soft text-accent" : "border-line"}`}
            >
              <Icon size={18} /> {t(label)}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          {t("„Automatisch“ folgt der Einstellung „Bewegung reduzieren“ deines Geräts.")}
          {deviceReduced
            ? t(" Dein Gerät hat sie eingeschaltet: Bei „Automatisch“ blendet FinanzKlee deshalb nur weich über, ohne Bewegung. Wähle „Immer an“ für alle Effekte (Gleiten, Hochzählen, Kleeblatt-Drehung).")
            : t(" Dein Gerät erlaubt Animationen, alle Effekte sind aktiv.")}
        </p>
      </Card>

      <Card title={t("Deine Konten")} subtitle={t("Gib deinen Konten eigene Namen und Farben, z. B. „Urlaubskasse“ statt „Freizeitkonto“")}>
        <ul className="space-y-4">
          {accounts.map((acc) => (
            <AccountEditor key={acc.id} account={acc} onSaved={() => flash()} />
          ))}
        </ul>
      </Card>

      <Card title={t("Dashboard")} subtitle={t("Wähle eine Vorlage oder gestalte alles frei auf dem Dashboard")}>
        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(PRESETS) as PresetId[]).map((p) => (
            <button
              key={p}
              onClick={() => start(async () => { await saveDashboardLayout(presetLayout(p)); flash(t("Vorlage „{name}“ aktiv", { name: t(PRESETS[p].label) })); })}
              className="rounded-2xl border border-line p-4 text-left transition hover:border-accent hover:bg-accent-soft"
            >
              <LayoutGrid size={20} className="text-accent" />
              <p className="mt-2 font-bold">{t(PRESETS[p].label)}</p>
              <p className="text-xs text-muted">{t(PRESETS[p].description)}</p>
            </button>
          ))}
        </div>
        <Link href="/dashboard" className="btn mt-4">
          <LayoutGrid size={17} />{" "}{t("Dashboard frei gestalten")}
        </Link>
      </Card>

      <Card title={t("Über FinanzKlee")}>
        <div className="flex items-center gap-4">
          <LogoMark size={56} />
          <p className="text-sm text-muted">
            {rich(t("Vier Blätter, vier Konten: <fix>Fixkosten</fix>, <spar>Sparen</spar>, <not>Notgroschen</not> und <frei>Freizeit</frei>. Glück ist planbar. 🍀"), {
              fix: (x) => <b style={{ color: ACCOUNT_META.FIXKOSTEN.color }}>{x}</b>,
              spar: (x) => <b style={{ color: ACCOUNT_META.SPAREN.color }}>{x}</b>,
              not: (x) => <b style={{ color: ACCOUNT_META.NOTGROSCHEN.color }}>{x}</b>,
              frei: (x) => <b style={{ color: ACCOUNT_META.FREIZEIT.color }}>{x}</b>,
            })}
          </p>
        </div>
      </Card>

      {saved && (
        <div className="animate-fade fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-8" role="status">
          <span className="animate-toast rounded-full bg-fg px-4 py-2 text-sm font-bold text-bg shadow-lg">{saved}</span>
        </div>
      )}
    </div>
  );
}

function AccountEditor({ account, onSaved }: { account: AccountLite; onSaved: () => void }) {
  const t = useT();
  const [name, setName] = useState(account.name);
  const [color, setColor] = useState(account.color);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const def = ACCOUNT_META[account.kind as AccountKind];

  const save = (patch: { name?: string; color?: string | null }) =>
    start(async () => {
      const res = await updateAccountAppearance({ accountId: account.id, ...patch });
      if (res?.error) setError(res.error);
      else {
        setError(null);
        onSaved();
      }
    });

  return (
    <li className="rounded-2xl border border-line p-3">
      <div className="flex items-center gap-3">
        <span className="h-10 w-2 shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <label className="label" htmlFor={`acc-${account.id}`}>{def.short}</label>
          <input
            id={`acc-${account.id}`}
            className="input font-semibold"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== account.name && save({ name })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {ACCOUNT_COLOR_CHOICES.map((c) => (
          <button
            key={c}
            onClick={() => { setColor(c); save({ color: c }); }}
            aria-label={t("Farbe {c}", { c: c })}
            aria-pressed={color === c}
            className={`flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:scale-110 ${color === c ? "ring-2 ring-fg ring-offset-2 ring-offset-surface" : ""}`}
            style={{ background: c }}
          >
            {color === c && <Check size={16} strokeWidth={3} className="animate-pop" />}
          </button>
        ))}
        <button
          onClick={() => { setColor(def.color); setName(def.label); save({ color: null, name: def.label }); }}
          className="chip ml-auto"
          title={t("Name und Farbe zurücksetzen")}
        >
          <RotateCcw size={14} />{" "}{t("Standard")}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </li>
  );
}
