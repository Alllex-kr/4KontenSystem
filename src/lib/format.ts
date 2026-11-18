const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function formatCents(cents: number): string {
  return eur.format(cents / 100);
}

export function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** "12,50" oder "12.50" oder "1.234,56" -> 1250 / 123456. Gibt null bei ungültiger Eingabe zurück. */
export function parseEuroToCents(input: string): number | null {
  const s = input.trim().replace(/\s|€/g, "");
  if (!s) return null;
  let normalized = s;
  if (s.includes(",")) normalized = s.replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(parseFloat(normalized) * 100);
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
