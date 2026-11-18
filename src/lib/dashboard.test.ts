import { describe, expect, it } from "vitest";
import { WIDGET_IDS, parseLayout, presetLayout } from "./dashboard";
import { normalizeAppearance } from "./appearance";

describe("Dashboard-Layout", () => {
  it("nutzt Standard bei leerem oder kaputtem JSON", () => {
    expect(parseLayout(null)).toEqual(parseLayout(JSON.stringify(presetLayout("standard"))));
    expect(parseLayout("{kaputt").map((w) => w.id)).toEqual(presetLayout("standard").map((w) => w.id));
  });
  it("entfernt doppelte und unbekannte Widgets und ergänzt fehlende ausgeblendet", () => {
    const l = parseLayout(JSON.stringify([
      { id: "recent", size: "full", visible: true },
      { id: "recent", size: "sm", visible: true },
    ]));
    // Neue Pflicht-Widgets: Checkliste oben, Ausgleich sichtbar; alle anderen fehlenden ausgeblendet
    expect(l[0]).toEqual({ id: "todos", size: "full", visible: true });
    expect(l[1]).toEqual({ id: "recent", size: "full", visible: true });
    expect(l.filter((w) => w.id === "recent")).toHaveLength(1);
    expect(l).toHaveLength(WIDGET_IDS.length);
    expect(l.filter((w) => w.visible).map((w) => w.id).sort()).toEqual(["ausgleich", "recent", "todos"]);
  });
  it("verwirft ungültige Größen", () => {
    const l = parseLayout(JSON.stringify([{ id: "kpis", size: "riesig", visible: true }]));
    expect(l).toEqual(parseLayout(null));
  });
  it("jede Vorlage enthält jedes Widget genau einmal", () => {
    for (const p of ["standard", "minimal", "analyse"] as const) {
      const ids = presetLayout(p).map((w) => w.id).sort();
      expect(ids).toEqual([...WIDGET_IDS].sort());
    }
  });
});

describe("Darstellung", () => {
  it("fällt bei unbekannten Werten auf Standard zurück", () => {
    expect(normalizeAppearance({ theme: "neon", accent: "gold", fontScale: "riesig" })).toEqual({
      theme: "system",
      accent: "klee",
      fontScale: "normal",
      hideAmounts: false,
      motion: "system",
    });
  });
});
