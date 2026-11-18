import { INTL_LOCALES } from "./i18n/config";
import { currentLocale } from "./i18n/current";

// Formatierung folgt der Sprache des Nutzers, die Währung bleibt Euro.
const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();
function fmt<F extends Intl.NumberFormat | Intl.DateTimeFormat>(key: string, make: (l: string) => F): F {
  const intl = INTL_LOCALES[currentLocale()];
  const k = `${intl}|${key}`;
  let f = cache.get(k) as F | undefined;
  if (!f) cache.set(k, (f = make(intl)));
  return f;
}

export function formatCents(cents: number): string {
  return fmt("eur", (l) => new Intl.NumberFormat(l, { style: "currency", currency: "EUR" })).format(cents / 100);
}

export function formatDate(d: Date | string): string {
  return fmt("date", (l) => new Intl.DateTimeFormat(l, { day: "2-digit", month: "2-digit", year: "numeric" })).format(new Date(d));
}

/** Kurzer Monatsname, month 1–12 (z. B. "Jan", "янв.", "Oca"). */
export function monthShort(month: number): string {
  return fmt("mon", (l) => new Intl.DateTimeFormat(l, { month: "short" })).format(new Date(2026, month - 1, 15));
}

/** "Januar 2026" in der Sprache des Nutzers. */
export function formatMonthYear(d: Date): string {
  return fmt("monyear", (l) => new Intl.DateTimeFormat(l, { month: "long", year: "numeric" })).format(d);
}

/** Zahl in der Sprache des Nutzers (Tausendertrennzeichen). */
export function formatNumber(n: number, digits = 0): string {
  return fmt(`num${digits}`, (l) => new Intl.NumberFormat(l, { maximumFractionDigits: digits, minimumFractionDigits: digits })).format(n);
}

/** "12,50" oder "12.50" oder "1.234,56" oder "1,234.56" -> 1250 / 123456. Gibt null bei ungültiger Eingabe zurück. */
export function parseEuroToCents(input: string): number | null {
  const s = input.trim().replace(/\s|€/g, "");
  if (!s) return null;
  let normalized = s;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) normalized = s.replace(/\./g, "").replace(",", "."); // 1.234,56
  else if (lastDot > lastComma && lastComma >= 0) normalized = s.replace(/,/g, ""); // 1,234.56
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(parseFloat(normalized) * 100);
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Intl-Locale der aktuellen Sprache, z. B. für toLocaleDateString(intlLocale(), …). */
export const intlLocale = () => INTL_LOCALES[currentLocale()];
