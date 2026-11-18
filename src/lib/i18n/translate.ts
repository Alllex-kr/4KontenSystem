// Übersetzen ohne Bibliothek. Der deutsche Text ist der Schlüssel.
//   t("Speichern")                       → "Save"
//   t("Noch {n} Umsätze frei", { n: 5 }) → "5 transactions left"
// Fehlt eine Übersetzung, erscheint der deutsche Text.

export type Messages = Record<string, string>;
export type TVars = Record<string, string | number | null | undefined>;
export type T = (key: string, vars?: TVars) => string;

export function interpolate(text: string, vars?: TVars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name] ?? "") : m));
}

export function makeT(messages: Messages): T {
  return (key, vars) => interpolate(messages[key] || key, vars);
}

/**
 * Markiert einen Text als übersetzbar, ohne ihn sofort zu übersetzen.
 * Für Texte außerhalb von Komponenten (Konstanten, Zod-Meldungen), die später mit t(text) angezeigt werden.
 * Der Vollständigkeitstest findet so auch diese Texte.
 */
export const msg = <S extends string>(text: S): S => text;
