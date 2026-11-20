// Sammelt alle übersetzbaren Texte aus dem Quellcode: t("…"), tr("…") und msg("…").
// Genutzt vom Vollständigkeitstest und von `npm run i18n:check`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const CALL = /(?<![\w.])(?:t|tr|msg)\(\s*("(?:[^"\\]|\\.)*")/g;

/** Bereiche, die bewusst nur Deutsch sind (Adminbereich, Impressum und Datenschutz). */
const SKIP = [/[\\/]admin[\\/]/, /[\\/]\(legal\)[\\/]/, /actions[\\/]admin\.ts$/, /\.test\.tsx?$/, /[\\/]i18n[\\/]/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

/** Map: Schlüssel → Fundstellen (Datei:Zeile) */
export function extractKeys(srcDir: string): Map<string, string[]> {
  const keys = new Map<string, string[]>();
  for (const file of files(srcDir)) {
    if (SKIP.some((re) => re.test(file))) continue;
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(CALL)) {
      const key = JSON.parse(m[1]) as string;
      const line = text.slice(0, m.index).split("\n").length;
      const where = `${relative(srcDir, file)}:${line}`;
      keys.set(key, [...(keys.get(key) ?? []), where]);
    }
  }
  return keys;
}

/** Platzhalter wie {name} in einem Text. */
export const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
