import { msg } from "./i18n/translate";

export const ACCOUNT_KINDS = ["FIXKOSTEN", "SPAREN", "NOTGROSCHEN", "FREIZEIT"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const ACCOUNT_META: Record<
  AccountKind,
  { label: string; short: string; color: string; description: string }
> = {
  FIXKOSTEN: {
    label: msg("Fixkostenkonto"),
    short: msg("Fixkosten"),
    color: "#3b82f6",
    description: msg("Hier kommt das Einkommen an. Miete, Handy, Versicherungen und unregelmäßige Zahlungen laufen von hier."),
  },
  SPAREN: {
    label: msg("Sparkonto"),
    short: msg("Sparen"),
    color: "#10b981",
    description: msg("Langfristiges Sparen und Investieren (z. B. ETF-Sparplan, Sparziele)."),
  },
  NOTGROSCHEN: {
    label: msg("Notgroschen"),
    short: msg("Notgroschen"),
    color: "#f59e0b",
    description: msg("Reserve für Unerwartetes: kaputter Laptop, Nachzahlung, Arztkosten."),
  },
  FREIZEIT: {
    label: msg("Freizeitkonto"),
    short: msg("Freizeit"),
    color: "#a855f7",
    description: msg("Alles, was Spaß macht: Essen gehen, Ausgehen, Hobbys, Shopping."),
  },
};

/** Standardname des Kontos in der Sprache des Nutzers; eigene Namen bleiben, wie sie sind. */
export function displayAccountName(name: string, kind: AccountKind, t: (k: string) => string) {
  const meta = ACCOUNT_META[kind];
  return name === meta.label ? t(meta.label) : name;
}

/** Kurzname für enge Stellen (Auswahllisten): Standardname → "Fixkosten" usw., eigener Name bleibt. */
export function shortAccountName(name: string, kind: AccountKind, t: (k: string) => string) {
  const meta = ACCOUNT_META[kind];
  return name === meta.label || name === t(meta.label) ? t(meta.short) : name;
}

export const CATEGORIES = [
  msg("Einkommen"),
  msg("Wohnen"),
  msg("Lebensmittel"),
  msg("Mobilität"),
  msg("Handy & Internet"),
  msg("Versicherung"),
  msg("Studium"),
  msg("Abos"),
  msg("Freizeit"),
  msg("Essen gehen"),
  msg("Shopping"),
  msg("Gesundheit"),
  msg("Reisen"),
  msg("Sparen"),
  msg("Umbuchung"),
  msg("Sonstiges"),
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4",
  "#84cc16", "#ec4899", "#f97316", "#6366f1", "#14b8a6", "#eab308",
  "#8b5cf6", "#22c55e", "#64748b", "#d946ef",
];

/** @deprecated monthShort() aus format.ts nutzen (übersetzt) */
export const MONTHS_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
