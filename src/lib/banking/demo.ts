/**
 * Demo-Bank: simuliert den kompletten Ablauf (Freigabe → Konten → Umsätze) ohne echten Anbieter.
 * Die Daten sind pro Verbindung zufällig, aber stabil (gleicher Seed = gleiche Umsätze),
 * damit Duplikat-Erkennung und wiederholtes Synchronisieren realistisch getestet werden können.
 */
import { hashString } from "../csvImport";
import type { BankProvider, ProviderAccount, ProviderTransaction } from "./types";

function rng(seed: string) {
  let h = parseInt(hashString(seed), 36) % 2147483647 || 1;
  return () => (h = (h * 48271) % 2147483647) / 2147483647;
}

const TEMPLATES: [string, string, number, number][] = [
  // Empfänger, Verwendungszweck, Min-Betrag, Max-Betrag (Cent, negativ = Ausgabe)
  ["REWE Markt GmbH", "Kartenzahlung", -6000, -800],
  ["EDEKA", "Kartenzahlung", -4500, -600],
  ["Lidl sagt Danke", "Kartenzahlung", -3500, -500],
  ["dm-drogerie markt", "Kartenzahlung", -2500, -300],
  ["Lieferando", "Bestellung", -3200, -1200],
  ["Mensa Studierendenwerk", "Kartenzahlung", -900, -300],
  ["Starbucks", "Kartenzahlung", -700, -350],
  ["Kino CinemaxX", "Tickets", -2400, -900],
  ["Amazon EU", "Bestellung", -6000, -900],
  ["DB Fernverkehr", "Ticket", -6500, -1900],
  ["Apotheke am Markt", "Kartenzahlung", -2200, -400],
];

export const DEMO_ACCOUNTS = (connectionSeed: string): ProviderAccount[] => [
  { externalId: `${connectionSeed}-giro`, name: "Demo Girokonto", iban: "DE00 0000 0000 0000 1234 56", balanceCents: 152340, currency: "EUR", type: "CHECKING" },
  { externalId: `${connectionSeed}-tagesgeld`, name: "Demo Tagesgeld", iban: "DE00 0000 0000 0000 6543 21", balanceCents: 200000, currency: "EUR", type: "SAVINGS" },
];

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Erzeugt Umsätze zwischen sinceIso und heute. */
export function demoTransactions(accountIds: string[], sinceIso: string, today = new Date()): ProviderTransaction[] {
  const out: ProviderTransaction[] = [];
  const start = new Date(`${sinceIso}T12:00:00`);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  for (const acc of accountIds) {
    const isGiro = acc.endsWith("-giro");
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const day = iso(d);
      const r = rng(`${acc}|${day}`);
      const push = (k: number, payee: string, purpose: string, amountCents: number) =>
        out.push({ externalId: `${acc}-${day}-${k}`, externalAccountId: acc, date: day, amountCents, payee, purpose });
      if (isGiro) {
        if (d.getDate() === 1) push(90, "Muster Werkstudenten GmbH", `Gehalt ${d.getMonth() + 1}/${d.getFullYear()}`, 95000);
        if (d.getDate() === 3) push(91, "Beispiel Hausverwaltung", "Miete WG-Zimmer", -42000);
        if (d.getDate() === 15) push(92, "Telefonica Germany", "Handyrechnung", -1499);
        const n = r() < 0.55 ? (r() < 0.3 ? 2 : 1) : 0;
        for (let k = 0; k < n; k++) {
          const [payee, purpose, min, max] = TEMPLATES[Math.floor(r() * TEMPLATES.length)];
          push(k, payee, purpose, Math.round(min + r() * (max - min)));
        }
      } else if (new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getDate() === 1) {
        push(0, "Demo Bank", "Zinsen", 123);
      }
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export const demoProvider: BankProvider = {
  id: "demo",
  label: "Demo-Bank",
  sandbox: true,
  async startImport(ctx) {
    const formId = `demo-${ctx.connectionId}`;
    return { redirectUrl: `/bankkonten/demo-bank?c=${encodeURIComponent(ctx.connectionId)}`, pendingFormId: formId };
  },
  async checkImport(ctx, pendingFormId) {
    if (pendingFormId.startsWith("done:")) return { status: "completed", externalConnectionId: ctx.connectionId, bankName: "FinanzKlee Demo-Bank" };
    if (pendingFormId.startsWith("aborted:")) return { status: "failed", message: "Die Freigabe wurde abgebrochen." };
    return { status: "pending", message: "Warte auf deine Freigabe bei der Demo-Bank …" };
  },
  async startUpdate(ctx) {
    return { taskId: `demo-task-${ctx.connectionId}` };
  },
  async checkUpdate() {
    return { status: "completed" };
  },
  async listAccounts(_ctx, externalConnectionId) {
    return DEMO_ACCOUNTS(externalConnectionId);
  },
  async listTransactions(_ctx, ids, since) {
    return demoTransactions(ids, since);
  },
  async deleteConnection() {},
};
