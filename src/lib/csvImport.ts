/**
 * CSV-Import für Kontoumsätze (reine Funktionen, laufen im Browser und auf dem Server).
 *
 * Unterstützt die gängigen deutschen Bank-Exporte (Sparkasse CSV-CAMT, ING, DKB,
 * Volksbank/Raiffeisen, comdirect) und englische Exporte (z. B. N26):
 *  - Zeichensatz UTF-8 (mit/ohne BOM) oder Windows-1252/ISO-8859-1
 *  - Trennzeichen ; , oder Tab
 *  - Vorspann-Zeilen vor der eigentlichen Kopfzeile
 *  - Beträge wie "1.234,56", "-12,50", "12,50-", "-12.5"
 *  - Datum wie "18.11.2026", "18.11.26", "2026-11-18"
 */
import type { Category } from "./constants";

export type Field = "date" | "amount" | "debit" | "credit" | "payee" | "payee2" | "purpose" | "balance";
export type Mapping = Partial<Record<Field, number>>;

export const FIELD_LABELS: Record<Field, string> = {
  date: "Datum",
  amount: "Betrag",
  payee: "Empfänger / Auftraggeber",
  payee2: "Zahlungspflichtiger (bei Eingängen)",
  purpose: "Verwendungszweck",
  balance: "Saldo / Kontostand",
  debit: "Soll (Ausgang)",
  credit: "Haben (Eingang)",
};

export interface ParsedRow {
  line: number;
  date: string; // YYYY-MM-DD
  amountCents: number;
  payee: string;
  purpose: string;
  balanceCents: number | null;
}

// ---------------------------------------------------------------- Einlesen

export function decodeBytes(input: ArrayBuffer | Uint8Array): { text: string; encoding: "UTF-8" | "Windows-1252" } {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text: text.replace(/^﻿/, ""), encoding: "UTF-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "Windows-1252" };
  }
}

export function detectDelimiter(text: string): ";" | "," | "\t" {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 40);
  let best: ";" | "," | "\t" = ";";
  let bestScore = -1;
  for (const d of [";", "\t", ","] as const) {
    let linesWith = 0;
    let total = 0;
    for (const l of lines) {
      const n = l.split(d).length - 1;
      total += n;
      if (n >= 2) linesWith++;
    }
    const score = linesWith * 1000 + total;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

/** CSV nach RFC 4180 (Anführungszeichen, "" als Escape, Zeilenumbrüche in Feldern). */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ""));
}

// ---------------------------------------------------------------- Spalten erkennen

export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

const FIELD_RULES: Record<Field, { keywords: string[]; exclude?: string[]; exactOnly?: boolean }> = {
  date: {
    keywords: ["buchungstag", "buchungsdatum", "buchung", "datum", "date", "bookingdate", "transactiondate", "wertstellung", "wertstellungsdatum", "valutadatum", "valuta"],
    exclude: ["text"],
  },
  amount: {
    keywords: ["betrag", "betrageur", "umsatz", "umsatzineur", "amount", "amounteur"],
    exclude: ["ursprung", "waehrung", "fremd", "original", "foreign"],
  },
  payee: {
    keywords: [
      "beguenstigterzahlungspflichtiger",
      "auftraggeberempfaenger",
      "namezahlungsbeteiligter",
      "zahlungsempfaengerin",
      "zahlungsempfaenger",
      "auftraggeberbeguenstigter",
      "empfaenger",
      "beguenstigter",
      "payee",
      "partnername",
      "counterparty",
      "name",
    ],
    exclude: ["iban", "konto", "bic", "bank", "nummer"],
  },
  payee2: {
    keywords: ["zahlungspflichtiger", "zahlungspflichtige", "auftraggeber", "sender", "payer"],
    exclude: ["iban", "konto", "empfaenger", "beguenstigter", "bic"],
  },
  purpose: {
    keywords: ["verwendungszweck", "paymentreference", "reference", "buchungstext", "vorgang", "beschreibung", "description", "text", "umsatztyp", "transactiontype"],
    exclude: ["iban"],
  },
  balance: { keywords: ["saldonachbuchung", "saldo", "kontostand", "balance"], exclude: ["waehrung"] },
  debit: { keywords: ["soll", "lastschrift", "ausgang", "debit"], exactOnly: true },
  credit: { keywords: ["haben", "gutschrift", "eingang", "credit"], exactOnly: true },
};

function scoreHeader(h: string, field: Field): number {
  const rule = FIELD_RULES[field];
  if (!h || rule.exclude?.some((x) => h.includes(x))) return 0;
  let best = 0;
  rule.keywords.forEach((k, i) => {
    let s = 0;
    if (h === k) s = 100 - i;
    else if (!rule.exactOnly && h.startsWith(k)) s = 60 - i;
    else if (!rule.exactOnly && k.length >= 4 && h.includes(k)) s = 30 - i;
    best = Math.max(best, s);
  });
  return best;
}

/** Ordnet die Spalten einer Kopfzeile automatisch den Feldern zu. */
export function autoMap(header: string[]): Mapping {
  const norm = header.map(normalizeHeader);
  const used = new Set<number>();
  const mapping: Mapping = {};
  const order: Field[] = ["date", "amount", "purpose", "payee", "payee2", "balance", "debit", "credit"];
  for (const field of order) {
    if ((field === "debit" || field === "credit") && mapping.amount !== undefined) continue;
    let bestCol = -1;
    let bestScore = 0;
    norm.forEach((h, col) => {
      if (used.has(col)) return;
      const s = scoreHeader(h, field);
      if (s > bestScore) {
        bestScore = s;
        bestCol = col;
      }
    });
    if (bestCol >= 0) {
      mapping[field] = bestCol;
      used.add(bestCol);
    }
  }
  return mapping;
}

/** Findet die eigentliche Kopfzeile (viele Banken schreiben Vorspann-Zeilen davor). */
export function findHeaderRow(rows: string[][]): { index: number; mapping: Mapping } | null {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const nonEmpty = rows[i].filter((c) => c !== "").length;
    if (nonEmpty < 3) continue;
    const m = autoMap(rows[i]);
    if (m.date !== undefined && (m.amount !== undefined || m.debit !== undefined || m.credit !== undefined)) {
      return { index: i, mapping: m };
    }
  }
  return null;
}

export function detectBank(header: string[]): string | null {
  const n = header.map(normalizeHeader);
  const has = (k: string) => n.includes(k);
  if (has("auftragskonto") && has("beguenstigterzahlungspflichtiger")) return "Sparkasse";
  if (has("auftraggeberempfaenger")) return "ING";
  if (has("zahlungsempfaengerin") || has("zahlungspflichtiger")) return "DKB";
  if (has("namezahlungsbeteiligter")) return "Volksbank / Raiffeisenbank";
  if (has("umsatzineur")) return "comdirect";
  if ((has("payee") || has("partnername")) && has("amounteur")) return "N26";
  return null;
}

// ---------------------------------------------------------------- Werte lesen

/** "1.234,56" → 123456, "-12,50" → -1250, "12,50-" → -1250, "-12.5" → -1250 */
export function parseAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  let s = raw.replace(/\s| |€|eur/gi, "").replace(/^\+/, "");
  if (!s) return null;
  let negative = false;
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot >= 0) {
    // Nur Punkt: genau 3 Nachkommastellen = Tausendertrennzeichen ("1.234")
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const cents = Math.round(parseFloat(s) * 100);
  return negative ? -cents : cents;
}

/** "18.11.2026" | "18.11.26" | "2026-11-18" | "18/11/2026" → "2026-11-18" */
export function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/))) {
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3]);
    if (y < 100) y += 2000;
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Liest alle Umsatzzeilen unterhalb der Kopfzeile. */
export function buildRows(rows: string[][], headerIndex: number, m: Mapping): { rows: ParsedRow[]; skipped: number } {
  const out: ParsedRow[] = [];
  let skipped = 0;
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    const date = m.date !== undefined ? parseDate(r[m.date]) : null;
    let amount: number | null = null;
    if (m.amount !== undefined) amount = parseAmount(r[m.amount]);
    else if (m.debit !== undefined || m.credit !== undefined) {
      const debit = m.debit !== undefined ? parseAmount(r[m.debit]) : null;
      const credit = m.credit !== undefined ? parseAmount(r[m.credit]) : null;
      if (debit !== null || credit !== null) amount = (credit ?? 0) - Math.abs(debit ?? 0);
    }
    if (!date || amount === null || amount === 0) {
      skipped++;
      continue;
    }
    let payee = m.payee !== undefined ? clean(r[m.payee]) : "";
    if (m.payee2 !== undefined && amount > 0 && clean(r[m.payee2])) payee = clean(r[m.payee2]);
    if (!payee && m.payee2 !== undefined) payee = clean(r[m.payee2]);
    out.push({
      line: i + 1,
      date,
      amountCents: amount,
      payee,
      purpose: m.purpose !== undefined ? clean(r[m.purpose]) : "",
      balanceCents: m.balance !== undefined ? parseAmount(r[m.balance]) : null,
    });
  }
  return { rows: out, skipped };
}

/** Beschreibung für die Buchung (max. 100 Zeichen). */
export function describe(row: Pick<ParsedRow, "payee" | "purpose">): string {
  const text = row.payee && row.purpose ? `${row.payee} · ${row.purpose}` : row.payee || row.purpose || "Umsatz";
  return text.length > 100 ? `${text.slice(0, 99)}…` : text;
}

/** Aktueller Kontostand aus der Saldo-Spalte (jüngste Buchung). */
export function latestBalance(rows: ParsedRow[]): number | null {
  const withBalance = rows.filter((r) => r.balanceCents !== null);
  if (!withBalance.length) return null;
  // Export kann auf- oder absteigend sortiert sein
  const first = withBalance[0];
  const last = withBalance[withBalance.length - 1];
  return (first.date >= last.date ? first : last).balanceCents;
}

// ---------------------------------------------------------------- Kategorien

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9&]+/g, " ")
    .trim();
}

/** Schlüssel für gelernte Regeln: Empfänger ohne lange Nummern (Bestell-/Kartennummern). */
export function payeeKey(row: Pick<ParsedRow, "payee" | "purpose">): string {
  const base = normalizeText(row.payee) || normalizeText(row.purpose).slice(0, 40);
  return base.replace(/\b\d{4,}\b/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

const DEFAULT_RULES: [Category, string[]][] = [
  ["Umbuchung", ["umbuchung", "uebertrag", "eigenes konto", "eigenuebertrag"]],
  ["Sparen", ["sparplan", "trade republic", "scalable", "depot", "etf", "tagesgeld", "wertpapier"]],
  ["Einkommen", ["gehalt", "lohn", "bafoeg", "kindergeld", "stipendium", "bundesagentur", "rente", "entgelt"]],
  ["Lebensmittel", ["rewe", "edeka", "aldi", "lidl", "netto", "penny", "kaufland", "norma", "tegut", "globus", "alnatura", "denns", "dm drogerie", "dm", "rossmann", "mueller", "supermarkt", "baeckerei", "flink", "getir"]],
  ["Essen gehen", ["lieferando", "wolt", "uber eats", "mcdonalds", "mcdonald", "burger king", "kfc", "subway", "starbucks", "restaurant", "pizzeria", "doener", "cafe", "mensa", "vapiano", "sushi"]],
  ["Mobilität", ["deutsche bahn", "db vertrieb", "db fernverkehr", "bahn", "bvg", "mvg", "hvv", "vbb", "rmv", "kvb", "vrr", "flixbus", "uber", "bolt", "tier", "lime", "shell", "aral", "esso", "tankstelle", "deutschlandticket", "dticket"]],
  ["Abos", ["netflix", "spotify", "disney", "prime video", "amazon prime", "apple com bill", "youtube premium", "dazn", "audible", "adobe", "icloud", "google one", "openai", "chatgpt", "crunchyroll"]],
  ["Handy & Internet", ["telekom", "vodafone", "o2", "telefonica", "congstar", "aldi talk", "1&1", "freenet", "drillisch", "fraenk", "winsim", "blau"]],
  ["Wohnen", ["miete", "wohnungsgenossenschaft", "hausverwaltung", "stadtwerke", "strom", "gasag", "e on", "eon", "vattenfall", "rundfunk", "beitragsservice", "nebenkosten", "wg"]],
  ["Versicherung", ["versicherung", "allianz", "huk", "ergo", "axa", "debeka", "techniker", "aok", "barmer", "dak", "haftpflicht", "krankenkasse"]],
  ["Studium", ["studierendenwerk", "studentenwerk", "semesterbeitrag", "universitaet", "hochschule", "uni", "immatrikulation"]],
  ["Shopping", ["amazon", "zalando", "about you", "h&m", "zara", "otto", "ebay", "mediamarkt", "saturn", "ikea", "primark", "decathlon", "thalia", "douglas", "paypal"]],
  ["Gesundheit", ["apotheke", "arzt", "zahnarzt", "praxis", "fitness", "mcfit", "fitx", "urban sports", "physio"]],
  ["Freizeit", ["kino", "cinemaxx", "eventim", "ticketmaster", "steam", "playstation", "nintendo", "xbox", "museum", "theater", "club", "konzert"]],
  ["Reisen", ["booking com", "airbnb", "ryanair", "lufthansa", "eurowings", "easyjet", "hostel", "hotel", "condor"]],
];

export type ImportRuleLike = { pattern: string; category: string };

export type SuggestionSource = "rule" | "keyword" | "fallback";

/**
 * Schlägt eine Kategorie vor und sagt, woher sie kommt:
 * rule = gelernte Regel, keyword = Stichwortliste, fallback = nichts erkannt (Einkommen/Sonstiges).
 * Nur "fallback"-Fälle werden (wenn eingeschaltet) an die KI gegeben.
 */
export function suggestCategoryDetailed(
  row: Pick<ParsedRow, "payee" | "purpose" | "amountCents">,
  userRules: ImportRuleLike[] = [],
): { category: string; source: SuggestionSource } {
  const key = payeeKey(row);
  const text = ` ${normalizeText(`${row.payee} ${row.purpose}`)} `;
  for (const r of userRules) {
    if (r.pattern && (key === r.pattern || text.includes(` ${r.pattern} `))) return { category: r.category, source: "rule" };
  }
  for (const [category, words] of DEFAULT_RULES) {
    if (category === "Einkommen" && row.amountCents < 0) continue;
    for (const w of words) {
      if (text.includes(` ${w} `) || (w.length >= 6 && text.includes(w))) return { category, source: "keyword" };
    }
  }
  return { category: row.amountCents > 0 ? "Einkommen" : "Sonstiges", source: "fallback" };
}

/** Schlägt eine Kategorie vor: zuerst gelernte Regeln, dann Stichwörter, sonst Einkommen/Sonstiges. */
export function suggestCategory(row: Pick<ParsedRow, "payee" | "purpose" | "amountCents">, userRules: ImportRuleLike[] = []): string {
  return suggestCategoryDetailed(row, userRules).category;
}

// ---------------------------------------------------------------- Duplikate

/** Schneller, deterministischer String-Hash (cyrb53). */
export function hashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Fingerabdruck je Umsatz. Gleiche Umsätze in derselben Datei (zwei Kaffees am selben Tag)
 * bekommen eine laufende Nummer, damit beide importiert werden.
 */
export function hashRows(rows: ParsedRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = `${r.date}|${r.amountCents}|${payeeKey(r)}|${normalizeText(r.purpose).slice(0, 80)}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return hashString(`${base}|#${n}`);
  });
}

// ---------------------------------------------------------------- Alles zusammen

export interface CsvAnalysis {
  /** Hinweis, wenn die Spalten nicht automatisch erkannt wurden */
  warning?: string;
  encoding: string;
  delimiter: string;
  table: string[][];
  headerIndex: number;
  header: string[];
  mapping: Mapping;
  bank: string | null;
}

export function analyzeCsv(input: ArrayBuffer | Uint8Array | string): CsvAnalysis | { error: string } {
  const { text, encoding } = typeof input === "string" ? { text: input.replace(/^﻿/, ""), encoding: "UTF-8" } : decodeBytes(input);
  if (!text.trim()) return { error: "Die Datei ist leer." };
  const delimiter = detectDelimiter(text);
  const table = parseCsv(text, delimiter);
  if (table.length < 2) return { error: "In der Datei wurden keine Umsätze gefunden." };
  const found = findHeaderRow(table);
  if (!found) {
    return {
      warning: "Datum und Betrag wurden nicht automatisch erkannt. Bitte ordne die Spalten unten selbst zu.",
      encoding,
      delimiter,
      table,
      headerIndex: 0,
      header: table[0],
      mapping: autoMap(table[0]),
      bank: null,
    };
  }
  return { encoding, delimiter, table, headerIndex: found.index, header: table[found.index], mapping: found.mapping, bank: detectBank(table[found.index]) };
}
