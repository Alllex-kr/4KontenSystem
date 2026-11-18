/**
 * KI-Kategorisierung von Umsätzen mit Claude (nur serverseitig verwenden).
 *
 * Datensparsam: An Claude gehen nur Empfänger, Verwendungszweck (ohne IBANs, lange Nummern
 * und E-Mail-Adressen) und der Betrag. Gleiche Empfänger werden nur einmal gefragt.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CATEGORIES, type Category } from "../constants";
import { normalizeText, payeeKey } from "../csvImport";

export const AI_MODEL = "claude-opus-5-5";
/** Listenpreis Claude Opus 5.5 in $ pro 1 Mio. Tokens (nur für die Kostenschätzung in der App). */
const PRICE_IN = 4;
const PRICE_OUT = 20;
const MAX_PER_REQUEST = 100;

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function estimateUsd(inputTokens: number, outputTokens: number): number {
  return (inputTokens * PRICE_IN + outputTokens * PRICE_OUT) / 1_000_000;
}

export interface AiItem {
  /** frei wählbare ID des Aufrufers (z. B. Import-Fingerabdruck) */
  id: string;
  payee: string;
  purpose: string;
  amountCents: number;
}

/** Entfernt IBANs, lange Nummern und E-Mail-Adressen; kürzt auf 120 Zeichen. */
export function redact(text: string): string {
  return text
    .replace(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,8}(?:[ ]?[A-Z0-9]{1,4})?\b/g, "[IBAN]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[E-Mail]")
    .replace(/\d{5,}/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

const CATEGORY_HINTS: Record<Category, string> = {
  Einkommen: "Lohn, Gehalt, BAföG, Kindergeld, Stipendium, Erstattungen (nur Eingänge)",
  Wohnen: "Miete, Nebenkosten, Strom, Gas, Rundfunkbeitrag, WG-Kasse",
  Lebensmittel: "Supermarkt, Bäckerei, Drogerie, Lieferdienste für Einkäufe",
  "Mobilität": "Bahn, ÖPNV, Deutschlandticket, Tanken, Carsharing, E-Scooter, Fahrrad",
  "Handy & Internet": "Mobilfunk, Internet- und Festnetzanschluss",
  Versicherung: "Haftpflicht, Kranken-, Hausrat-, Kfz-Versicherung",
  Studium: "Semesterbeitrag, Hochschule, Fachbücher, Kurse, Studierendenwerk-Gebühren",
  Abos: "Streaming, Musik, Software, Cloud-Speicher, Mitgliedschaften mit monatlicher Abbuchung",
  Freizeit: "Kino, Konzerte, Events, Hobbys, Spiele, Sport-Events",
  "Essen gehen": "Restaurant, Café, Imbiss, Mensa, Essenslieferung",
  Shopping: "Kleidung, Elektronik, Online-Shops, Geschenke, Haushaltswaren",
  Gesundheit: "Apotheke, Arzt, Zahnarzt, Fitnessstudio, Physiotherapie",
  Reisen: "Flüge, Hotels, Ferienwohnungen, Fernbusse für Urlaub",
  Sparen: "Sparpläne, ETF, Depot, Tagesgeld, Überträge zu Sparkonten",
  Umbuchung: "Überweisungen zwischen eigenen Konten",
  Sonstiges: "alles, was sich nicht sicher zuordnen lässt",
};

/** Feste Anweisung (wird gecacht, darf sich zwischen Anfragen nicht ändern). */
export const SYSTEM_PROMPT = `Du ordnest Kontoumsätze von Studierenden in Deutschland festen Kategorien zu. Die App heißt FinanzKlee.

Kategorien:
${CATEGORIES.map((c) => `- ${c}: ${CATEGORY_HINTS[c]}`).join("\n")}

Regeln:
- Ein Umsatz mit positivem Betrag ist ein Eingang, mit negativem Betrag ein Ausgang.
- "Einkommen" nur für Eingänge verwenden.
- Nutze Empfänger und Verwendungszweck. Bekannte Händler- und Firmennamen darfst du aus deinem Wissen einordnen.
- Wenn du nicht hinreichend sicher bist, wähle "Sonstiges". Lieber "Sonstiges" als eine falsche Kategorie.
- Gib für jede id genau eine Kategorie zurück.`;

const responseSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          category: { type: "string", enum: [...CATEGORIES] },
        },
        required: ["id", "category"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

const parsedSchema = z.object({ items: z.array(z.object({ id: z.string(), category: z.enum(CATEGORIES) })) });

export type CreateMessage = (params: Anthropic.Beta.MessageCreateParamsNonStreaming) => Promise<Anthropic.Beta.BetaMessage>;

export interface AiResult {
  categories: Map<string, Category>;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  /** Anzahl der an Claude gesendeten (deduplizierten) Einträge */
  sentItems: number;
  error?: string;
}

let defaultClient: Anthropic | null = null;
function defaultCreate(): CreateMessage {
  defaultClient ??= new Anthropic({ timeout: 90_000, maxRetries: 2 });
  return (params) => defaultClient!.beta.messages.create(params);
}

/** Gruppiert gleiche Empfänger (gleiche Richtung), damit jeder nur einmal gefragt wird. */
export function groupItems(items: AiItem[]) {
  const groups = new Map<string, { rep: AiItem; ids: string[] }>();
  for (const it of items) {
    const key = `${it.amountCents >= 0 ? "+" : "-"}|${payeeKey(it) || normalizeText(it.purpose).slice(0, 40)}`;
    const g = groups.get(key);
    if (g) g.ids.push(it.id);
    else groups.set(key, { rep: it, ids: [it.id] });
  }
  return [...groups.values()];
}

export function buildUserMessage(reps: { id: string; payee: string; purpose: string; amountCents: number }[]): string {
  const lines = reps.map((r) =>
    JSON.stringify({ id: r.id, empfaenger: redact(r.payee), zweck: redact(r.purpose), betrag: (r.amountCents / 100).toFixed(2) }),
  );
  return `Ordne diese ${reps.length} Umsätze zu:\n${lines.join("\n")}`;
}

export async function categorizeWithAi(items: AiItem[], opts: { create?: CreateMessage } = {}): Promise<AiResult> {
  const create = opts.create ?? defaultCreate();
  const result: AiResult = { categories: new Map(), inputTokens: 0, outputTokens: 0, requests: 0, sentItems: 0 };
  const groups = groupItems(items);

  for (let i = 0; i < groups.length; i += MAX_PER_REQUEST) {
    const chunk = groups.slice(i, i + MAX_PER_REQUEST);
    // Kurze IDs sparen Tokens; Zuordnung zurück über den Index
    const reps = chunk.map((g, idx) => ({ id: `u${idx}`, payee: g.rep.payee, purpose: g.rep.purpose, amountCents: g.rep.amountCents }));
    try {
      const message = await create({
        model: AI_MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        // Lehnt das Modell eine Anfrage ab, übernimmt serverseitig automatisch ein passendes anderes Modell
        fallbacks: "default",
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        output_config: {
          // Einfache Einordnung: wenig Denkaufwand reicht und spart Kosten
          effort: "low",
          format: { type: "json_schema", schema: responseSchema as unknown as Record<string, unknown> },
        },
        messages: [{ role: "user", content: buildUserMessage(reps) }],
      });
      result.requests++;
      result.sentItems += reps.length;
      result.inputTokens += (message.usage.input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0) + (message.usage.cache_read_input_tokens ?? 0);
      result.outputTokens += message.usage.output_tokens ?? 0;

      if (message.stop_reason === "refusal") {
        result.error = "Claude hat einen Teil der Umsätze nicht eingeordnet.";
        continue;
      }
      if (message.stop_reason === "max_tokens") {
        result.error = "Die Antwort war unvollständig.";
        continue;
      }
      const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        result.error = "Die Antwort der KI war nicht lesbar.";
        continue;
      }
      const parsed = parsedSchema.safeParse(json);
      if (!parsed.success) {
        result.error = "Die Antwort der KI passte nicht zum erwarteten Format.";
        continue;
      }
      for (const { id, category } of parsed.data.items) {
        const idx = Number(id.slice(1));
        const g = chunk[idx];
        if (!g || !id.startsWith("u")) continue;
        for (const originalId of g.ids) result.categories.set(originalId, category);
      }
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) result.error = "Der API-Schlüssel für Claude ist ungültig.";
      else if (e instanceof Anthropic.RateLimitError) result.error = "Claude ist gerade ausgelastet. Bitte später noch einmal versuchen.";
      else if (e instanceof Anthropic.APIConnectionError) result.error = "Claude ist gerade nicht erreichbar.";
      else if (e instanceof Anthropic.APIError) result.error = `Fehler bei Claude (${e.status ?? "unbekannt"}).`;
      else result.error = "Die KI-Kategorisierung ist fehlgeschlagen.";
      break;
    }
  }
  return result;
}
