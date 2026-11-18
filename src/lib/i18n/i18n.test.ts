import { join } from "node:path";
import { createElement, isValidElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { LOCALES, matchAcceptLanguage } from "./config";
import { extractKeys, placeholders } from "./extract";
import { MESSAGES } from "./messages";
import { rich } from "./rich";
import { interpolate, makeT } from "./translate";

const keys = extractKeys(join(__dirname, "..", ".."));
const tags = (s: string) => [...s.matchAll(/<(\w+)>/g)].map((m) => m[1]).sort();

describe("Übersetzungen", () => {
  it("findet die Texte im Code", () => {
    expect(keys.size).toBeGreaterThan(500);
    expect(keys.has("Speichern")).toBe(true);
  });

  for (const locale of LOCALES.filter((l) => l !== "de")) {
    describe(locale, () => {
      const dict = MESSAGES[locale];

      it("hat jeden Text aus dem Code", () => {
        const missing = [...keys.keys()].filter((k) => !(k in dict)).map((k) => `${k}  (${keys.get(k)![0]})`);
        expect(missing, `Fehlende Übersetzungen (${locale}). Ergänzen in src/lib/i18n/messages/${locale}.ts`).toEqual([]);
      });

      it("hat keine leeren Übersetzungen", () => {
        expect(Object.entries(dict).filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
      });

      it("behält Platzhalter {…} und Markierungen <…> bei", () => {
        const wrong = Object.entries(dict)
          .filter(([k, v]) => placeholders(k).join() !== placeholders(v).join() || tags(k).join() !== tags(v).join())
          .map(([k, v]) => `${k}  →  ${v}`);
        expect(wrong).toEqual([]);
      });

      it("enthält keine veralteten Texte", () => {
        expect(Object.keys(dict).filter((k) => !keys.has(k))).toEqual([]);
      });
    });
  }
});

describe("t() und Hilfen", () => {
  it("setzt Platzhalter ein und fällt auf Deutsch zurück", () => {
    const t = makeT({ "Hallo {name}": "Hello {name}" });
    expect(t("Hallo {name}", { name: "Lea" })).toBe("Hello Lea");
    expect(t("Unbekannt {x}", { x: 1 })).toBe("Unbekannt 1");
    expect(interpolate("{a} und {b}", { a: "x" })).toBe("x und {b}");
    expect(interpolate("{a}", { a: undefined })).toBe("");
  });

  it("wählt die Browsersprache nach Gewichtung", () => {
    expect(matchAcceptLanguage("ru-RU,ru;q=0.9,en;q=0.8")).toBe("ru");
    expect(matchAcceptLanguage("fr-FR,fr;q=0.9,es;q=0.5")).toBe("es");
    expect(matchAcceptLanguage("en;q=0.4,tr;q=0.8")).toBe("tr");
    expect(matchAcceptLanguage("fr,it")).toBeNull();
    expect(matchAcceptLanguage(undefined)).toBeNull();
  });

  it("rich() macht aus Markierungen Elemente, egal an welcher Stelle", () => {
    const node = rich("Erst <b>fett</b>, dann <x>weg</x>.", { b: (c) => createElement("strong", null, c) }) as ReactElement<{ children: unknown[] }>;
    const parts = node.props.children;
    expect(parts[0]).toBe("Erst ");
    expect(isValidElement(parts[1])).toBe(true);
    expect(parts[2]).toBe(", dann ");
    expect(parts[4]).toBe(".");
  });
});
