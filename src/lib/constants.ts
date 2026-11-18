export const ACCOUNT_KINDS = ["FIXKOSTEN", "SPAREN", "NOTGROSCHEN", "FREIZEIT"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const ACCOUNT_META: Record<
  AccountKind,
  { label: string; short: string; color: string; description: string }
> = {
  FIXKOSTEN: {
    label: "Fixkostenkonto",
    short: "Fixkosten",
    color: "#3b82f6",
    description: "Hier kommt das Einkommen an. Miete, Handy, Versicherungen und unregelmäßige Zahlungen laufen von hier.",
  },
  SPAREN: {
    label: "Sparkonto",
    short: "Sparen",
    color: "#10b981",
    description: "Langfristiges Sparen und Investieren (z. B. ETF-Sparplan, Sparziele).",
  },
  NOTGROSCHEN: {
    label: "Notgroschen",
    short: "Notgroschen",
    color: "#f59e0b",
    description: "Reserve für Unerwartetes: kaputter Laptop, Nachzahlung, Arztkosten.",
  },
  FREIZEIT: {
    label: "Freizeitkonto",
    short: "Freizeit",
    color: "#a855f7",
    description: "Alles, was Spaß macht: Essen gehen, Ausgehen, Hobbys, Shopping.",
  },
};

export const CATEGORIES = [
  "Einkommen",
  "Wohnen",
  "Lebensmittel",
  "Mobilität",
  "Handy & Internet",
  "Versicherung",
  "Studium",
  "Abos",
  "Freizeit",
  "Essen gehen",
  "Shopping",
  "Gesundheit",
  "Reisen",
  "Sparen",
  "Umbuchung",
  "Sonstiges",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4",
  "#84cc16", "#ec4899", "#f97316", "#6366f1", "#14b8a6", "#eab308",
  "#8b5cf6", "#22c55e", "#64748b", "#d946ef",
];

export const MONTHS_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
