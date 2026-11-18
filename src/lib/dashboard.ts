import { z } from "zod";

export const WIDGET_SIZES = ["sm", "md", "lg", "full"] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

export const WIDGETS = {
  todos: { title: "Checkliste", description: "Was jetzt zu tun ist: Ausgleich, Daueraufträge, Rücklagen" },
  ausgleich: { title: "Ausgleich & Überweisungen", description: "Puffer prüfen, Zusatz-Zahlung, notwendige Umbuchungen" },
  kpis: { title: "Kennzahlen", description: "Vermögen, Einkommen, Freizeit übrig, Sparquote" },
  accounts: { title: "Kontenübersicht", description: "Die vier Konten mit Stand und Monatsbetrag" },
  freizeit: { title: "Freizeit-Budget", description: "Was du diesen Monat noch ausgeben darfst" },
  quickadd: { title: "Schnellbuchung", description: "Ausgabe direkt vom Dashboard eintragen" },
  allocation: { title: "Monatliche Verteilung", description: "Wie dein Einkommen aufgeteilt wird" },
  forecast: { title: "Saldo-Verlauf Fixkostenkonto", description: "Prognose für 60 Tage mit Mindestpuffer" },
  projection: { title: "Vermögensprognose", description: "Sparen und Notgroschen in 12 Monaten" },
  balances: { title: "Aufteilung deines Geldes", description: "Aktuelle Kontostände im Vergleich" },
  cashflow: { title: "Einnahmen & Ausgaben", description: "Die letzten 6 Monate" },
  categories: { title: "Ausgaben nach Kategorie", description: "Dieser Monat" },
  transfers: { title: "Daueraufträge", description: "Empfohlene Umbuchungen pro Monat" },
  goals: { title: "Sparziele", description: "Fortschritt deiner Ziele" },
  recent: { title: "Letzte Buchungen", description: "Die neuesten Einträge" },
} as const;
export type WidgetId = keyof typeof WIDGETS;
export const WIDGET_IDS = Object.keys(WIDGETS) as WidgetId[];

export type WidgetConfig = { id: WidgetId; size: WidgetSize; visible: boolean };

const presets: Record<string, [WidgetId, WidgetSize, boolean][]> = {
  standard: [
    ["todos", "full", true],
    ["kpis", "full", true],
    ["accounts", "full", true],
    ["allocation", "sm", true],
    ["forecast", "lg", true],
    ["projection", "lg", true],
    ["balances", "sm", true],
    ["cashflow", "lg", true],
    ["categories", "sm", true],
    ["transfers", "md", true],
    ["ausgleich", "md", true],
    ["goals", "md", true],
    ["recent", "full", true],
    ["freizeit", "sm", false],
    ["quickadd", "sm", false],
  ],
  minimal: [
    ["todos", "full", true],
    ["freizeit", "md", true],
    ["quickadd", "md", true],
    ["accounts", "full", true],
    ["recent", "full", true],
    ["kpis", "full", false],
    ["allocation", "sm", false],
    ["forecast", "lg", false],
    ["projection", "lg", false],
    ["balances", "sm", false],
    ["cashflow", "lg", false],
    ["categories", "sm", false],
    ["transfers", "md", false],
    ["goals", "md", false],
    ["ausgleich", "md", false],
  ],
  analyse: [
    ["kpis", "full", true],
    ["todos", "md", true],
    ["ausgleich", "md", true],
    ["forecast", "full", true],
    ["cashflow", "lg", true],
    ["categories", "sm", true],
    ["projection", "lg", true],
    ["balances", "sm", true],
    ["allocation", "md", true],
    ["transfers", "md", true],
    ["accounts", "full", false],
    ["goals", "md", false],
    ["recent", "full", false],
    ["freizeit", "sm", false],
    ["quickadd", "sm", false],
  ],
};

export const PRESETS = {
  standard: { label: "Standard", description: "Alles Wichtige auf einen Blick" },
  minimal: { label: "Minimal", description: "Freizeit-Budget, Schnellbuchung, Konten" },
  analyse: { label: "Analyse", description: "Diagramme und Prognosen im Fokus" },
} as const;
export type PresetId = keyof typeof PRESETS;

export function presetLayout(id: PresetId): WidgetConfig[] {
  return presets[id].map(([wid, size, visible]) => ({ id: wid, size, visible }));
}

export const layoutSchema = z
  .array(z.object({ id: z.enum(WIDGET_IDS as [WidgetId, ...WidgetId[]]), size: z.enum(WIDGET_SIZES), visible: z.boolean() }))
  .max(50);

/** Gespeichertes Layout lesen. Unbekannte Widgets fliegen raus, neue Widgets werden (ausgeblendet) ergänzt. */
export function parseLayout(json: string | null | undefined): WidgetConfig[] {
  let list: WidgetConfig[] = presetLayout("standard");
  if (json) {
    try {
      const parsed = layoutSchema.safeParse(JSON.parse(json));
      if (parsed.success) list = parsed.data;
    } catch {
      /* Standard verwenden */
    }
  }
  const seen = new Set<WidgetId>();
  const unique = list.filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true)));
  for (const id of WIDGET_IDS) {
    if (seen.has(id)) continue;
    // Neue, wichtige Widgets auch in bestehenden Layouts sichtbar machen (Checkliste ganz oben)
    if (id === "todos") unique.unshift({ id, size: "full", visible: true });
    else if (id === "ausgleich") unique.push({ id, size: "md", visible: true });
    else unique.push({ id, size: "md", visible: false });
  }
  return unique;
}
