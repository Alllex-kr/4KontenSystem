import { describe, hashString, suggestCategoryDetailed, type ImportRuleLike, type SuggestionSource } from "../csvImport";
import { CATEGORIES, type Category } from "../constants";
import type { ProviderTransaction } from "./types";

export interface PlannedRow {
  accountId: string; // FinanzKlee-Konto
  importHash: string;
  date: string;
  amountCents: number;
  description: string;
  category: Category;
  /** Herkunft des Vorschlags; "fallback" = nichts erkannt → Kandidat für die KI */
  source: SuggestionSource;
  payee: string;
  purpose: string;
}

/** Eindeutiger Fingerabdruck je Bank-Umsatz (unabhängig von Text-Änderungen der Bank). */
export function bankHash(provider: string, externalId: string): string {
  return hashString(`bank:${provider}:${externalId}`);
}

/**
 * Plant, welche Umsätze neu angelegt werden: ordnet sie den FinanzKlee-Konten zu,
 * überspringt bekannte (existingHashes) und schlägt Kategorien vor.
 */
export function planSync(
  provider: string,
  txs: ProviderTransaction[],
  accountMap: Map<string, string>, // externe Konto-ID → FinanzKlee-Konto-ID
  existingHashes: Set<string>,
  rules: ImportRuleLike[],
): PlannedRow[] {
  const seen = new Set<string>();
  const out: PlannedRow[] = [];
  for (const t of txs) {
    const accountId = accountMap.get(t.externalAccountId);
    if (!accountId || !t.amountCents || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) continue;
    const importHash = bankHash(provider, t.externalId);
    if (existingHashes.has(importHash) || seen.has(importHash)) continue;
    seen.add(importHash);
    const { category: suggested, source } = suggestCategoryDetailed(t, rules);
    out.push({
      accountId,
      importHash,
      date: t.date,
      amountCents: t.amountCents,
      description: describe(t),
      category: (CATEGORIES as readonly string[]).includes(suggested) ? (suggested as Category) : "Sonstiges",
      source,
      payee: t.payee,
      purpose: t.purpose,
    });
  }
  return out;
}

/** Ab wann Umsätze geholt werden: erstmalig 90 Tage, danach ab letzter Synchronisierung minus 7 Tage Puffer. */
export function syncSince(lastSyncAt: Date | null, now = new Date()): string {
  const d = lastSyncAt ? new Date(lastSyncAt.getTime() - 7 * 86_400_000) : new Date(now.getTime() - 90 * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
