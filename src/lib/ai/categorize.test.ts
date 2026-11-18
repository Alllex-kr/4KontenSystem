import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { buildUserMessage, categorizeWithAi, estimateUsd, groupItems, redact, type CreateMessage } from "./categorize";
import { suggestCategoryDetailed } from "../csvImport";

/** Baut eine Antwort, wie sie die Messages API liefert. */
function reply(json: unknown, stop: Anthropic.Beta.BetaMessage["stop_reason"] = "end_turn"): Anthropic.Beta.BetaMessage {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text: JSON.stringify(json), citations: null }],
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 800, output_tokens: 120, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  } as unknown as Anthropic.Beta.BetaMessage;
}

const items = [
  { id: "a", payee: "BURGERMEISTER GMBH", purpose: "Kartenzahlung 2026-11-12 Karte 12345678", amountCents: -1290 },
  { id: "b", payee: "Burgermeister GmbH", purpose: "Kartenzahlung", amountCents: -990 },
  { id: "c", payee: "Max Muster", purpose: "Rückzahlung Konzertkarte IBAN DE89370400440532013000", amountCents: 3500 },
];

describe("Datensparsamkeit", () => {
  it("entfernt IBANs, lange Nummern und E-Mail-Adressen", () => {
    expect(redact("Überweisung an DE89 3704 0044 0532 0130 00 von max@example.com Ref 1234567")).toBe("Überweisung an [IBAN] von [E-Mail] Ref #");
    expect(redact("a".repeat(300))).toHaveLength(120);
  });
  it("fragt gleiche Empfänger nur einmal", () => {
    const groups = groupItems(items);
    expect(groups).toHaveLength(2);
    expect(groups[0].ids).toEqual(["a", "b"]);
  });
  it("Nachricht enthält keine IBAN und keine Kartennummer", () => {
    const msg = buildUserMessage(items.map((i) => ({ ...i })));
    expect(msg).not.toContain("DE89370400440532013000");
    expect(msg).not.toContain("12345678");
    expect(msg).toContain("-12.90");
  });
});

describe("Kategorisierung (mit nachgebauter API)", () => {
  it("schickt das richtige Modell, Fallback, strukturiertes Format und wendet Ergebnisse auf alle IDs an", async () => {
    const create = vi.fn<CreateMessage>(async () =>
      reply({ items: [{ id: "u0", category: "Essen gehen" }, { id: "u1", category: "Sonstiges" }] }),
    );
    const r = await categorizeWithAi(items, { create });
    const params = create.mock.calls[0][0];
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.fallbacks).toBe("default");
    expect(params.output_config?.effort).toBe("low");
    expect(params.output_config?.format?.type).toBe("json_schema");
    expect(r.categories.get("a")).toBe("Essen gehen");
    expect(r.categories.get("b")).toBe("Essen gehen");
    expect(r.categories.get("c")).toBe("Sonstiges");
    expect(r.requests).toBe(1);
    expect(r.sentItems).toBe(2);
    expect(r.inputTokens).toBe(800);
    expect(r.error).toBeUndefined();
  });

  it("ignoriert unbekannte Kategorien und meldet Ablehnungen", async () => {
    const bad = vi.fn<CreateMessage>(async () => reply({ items: [{ id: "u0", category: "Luxus" }] }));
    expect((await categorizeWithAi(items, { create: bad })).categories.size).toBe(0);
    const refused = vi.fn<CreateMessage>(async () => reply({}, "refusal"));
    const r = await categorizeWithAi(items, { create: refused });
    expect(r.categories.size).toBe(0);
    expect(r.error).toMatch(/nicht eingeordnet/);
  });

  it("teilt große Mengen in mehrere Anfragen", async () => {
    const many = Array.from({ length: 230 }, (_, i) => ({ id: String(i), payee: `Händler ${i} Laden`, purpose: "", amountCents: -500 }));
    const create = vi.fn<CreateMessage>(async () => reply({ items: [] }));
    const r = await categorizeWithAi(many, { create });
    expect(create).toHaveBeenCalledTimes(3);
    expect(r.sentItems).toBe(230);
  });

  it("Kostenschätzung nach Listenpreis", () => {
    expect(estimateUsd(1_000_000, 0)).toBe(4);
    expect(estimateUsd(0, 1_000_000)).toBe(20);
  });
});

describe("Herkunft der Vorschläge", () => {
  it("unterscheidet Regel, Stichwort und Rückfall", () => {
    expect(suggestCategoryDetailed({ payee: "REWE", purpose: "", amountCents: -100 }).source).toBe("keyword");
    expect(suggestCategoryDetailed({ payee: "Burgermeister", purpose: "", amountCents: -100 }).source).toBe("fallback");
    expect(suggestCategoryDetailed({ payee: "Burgermeister", purpose: "", amountCents: -100 }, [{ pattern: "burgermeister", category: "Essen gehen" }])).toEqual({
      category: "Essen gehen",
      source: "rule",
    });
  });
});
