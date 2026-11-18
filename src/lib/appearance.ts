export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const ACCENTS = {
  klee: { label: "Klee (Standard)", color: "#15803d" },
  indigo: { label: "Indigo", color: "#4f46e5" },
  violet: { label: "Violett", color: "#7c3aed" },
  emerald: { label: "Smaragd", color: "#059669" },
  sky: { label: "Himmelblau", color: "#0284c7" },
  rose: { label: "Rosé", color: "#e11d48" },
  amber: { label: "Bernstein", color: "#d97706" },
} as const;
export type Accent = keyof typeof ACCENTS;

export const FONT_SCALES = ["normal", "large"] as const;
export type FontScale = (typeof FONT_SCALES)[number];

export const MOTIONS = ["system", "on", "off"] as const;
export type Motion = (typeof MOTIONS)[number];

export const ACCOUNT_COLOR_CHOICES = [
  "#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4",
  "#ec4899", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#64748b",
];

export type Appearance = { theme: Theme; accent: Accent; fontScale: FontScale; hideAmounts: boolean; motion: Motion };

export const DEFAULT_APPEARANCE: Appearance = { theme: "system", accent: "klee", fontScale: "normal", hideAmounts: false, motion: "system" };

export const APPEARANCE_COOKIE = "vk_appearance";

/** Cookie-Wert lesen (ungültige Werte werden ignoriert). */
export function parseAppearanceCookie(raw: string | undefined): Partial<Appearance> | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

export function normalizeAppearance(s: Partial<Record<keyof Appearance, unknown>> | null | undefined): Appearance {
  return {
    theme: THEMES.includes(s?.theme as Theme) ? (s!.theme as Theme) : "system",
    accent: (s?.accent as string) in ACCENTS ? (s!.accent as Accent) : "klee",
    fontScale: FONT_SCALES.includes(s?.fontScale as FontScale) ? (s!.fontScale as FontScale) : "normal",
    hideAmounts: Boolean(s?.hideAmounts),
    motion: MOTIONS.includes(s?.motion as Motion) ? (s!.motion as Motion) : "system",
  };
}

/** Setzt die Darstellung sofort im Browser (Live-Vorschau, bevor der Server gespeichert hat). */
export function applyAppearance(a: Partial<Appearance>) {
  const el = document.documentElement;
  if (a.theme) el.dataset.theme = a.theme;
  if (a.accent) el.dataset.accent = a.accent;
  if (a.fontScale) el.dataset.font = a.fontScale;
  if (a.hideAmounts !== undefined) el.dataset.privacy = a.hideAmounts ? "on" : "off";
  if (a.motion) el.dataset.motion = a.motion;
  window.dispatchEvent(new Event("appearancechange"));
}
