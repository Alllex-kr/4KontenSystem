import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeCsv,
  buildRows,
  describe as describeRow,
  detectDelimiter,
  hashRows,
  latestBalance,
  parseAmount,
  parseCsv,
  parseDate,
  payeeKey,
  suggestCategory,
  type CsvAnalysis,
} from "./csvImport";

const sample = (name: string) => readFileSync(path.join(__dirname, "../../public/beispiele", name));

function load(name: string) {
  const a = analyzeCsv(sample(name));
  if ("error" in a) throw new Error(a.error);
  return { a, ...buildRows(a.table, a.headerIndex, a.mapping) } as { a: CsvAnalysis } & ReturnType<typeof buildRows>;
}

describe("Beträge und Datum", () => {
  it.each([
    ["1.234,56", 123456],
    ["-12,50", -1250],
    ["12,50-", -1250],
    ["-12.5", -1250],
    ["1,049.00", 104900],
    ["1.234", 123400],
    ["+950,00 €", 95000],
    ["-1.049,00", -104900],
    ["abc", null],
    ["", null],
  ])("parseAmount(%s) = %s", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each([
    ["18.11.2026", "2026-11-18"],
    ["18.11.26", "2026-11-18"],
    ["2026-11-18", "2026-11-18"],
    ["1.2.2026", "2026-02-01"],
    ["31.02.2026", null],
    ["Buchung", null],
  ])("parseDate(%s) = %s", (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });
});

describe("CSV-Grundlagen", () => {
  it("erkennt Trennzeichen", () => {
    expect(detectDelimiter('"a";"b";"c"\n"1,5";"2";"3"')).toBe(";");
    expect(detectDelimiter('"a","b","c"\n"1.5","2","3"')).toBe(",");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });
  it("versteht Anführungszeichen, Escapes und Zeilenumbrüche in Feldern", () => {
    const rows = parseCsv('a;"b ""x""";"c\nd"\r\n1;2;3', ";");
    expect(rows).toEqual([["a", 'b "x"', "c\nd"], ["1", "2", "3"]]);
  });
});

describe("Bank-Exporte", () => {
  it("Sparkasse (Windows-1252, CSV-CAMT)", () => {
    const { a, rows } = load("sparkasse-beispiel.csv");
    expect(a.bank).toBe("Sparkasse");
    expect(a.encoding).toBe("Windows-1252");
    expect(rows).toHaveLength(11);
    expect(rows[0]).toMatchObject({ date: "2026-11-17", amountCents: -2347, payee: "REWE SAGT DANKE" });
    const baker = rows.find((r) => r.amountCents === -460)!;
    expect(baker.payee).toBe("Bäckerei Müller");
    expect(suggestCategory(baker)).toBe("Lebensmittel");
    expect(rows.find((r) => r.amountCents === 95000)?.payee).toBe("Muster Werkstudenten GmbH");
  });

  it("ING (Vorspann, Saldo, doppelte Währungsspalte)", () => {
    const { a, rows } = load("ing-beispiel.csv");
    expect(a.bank).toBe("ING");
    expect(a.headerIndex).toBeGreaterThan(5);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({ date: "2026-11-18", amountCents: -3210, payee: "EDEKA Center Beispielstadt" });
    expect(latestBalance(rows)).toBe(123456);
  });

  it("DKB (UTF-8 mit BOM, Zahler bei Eingängen)", () => {
    const { a, rows } = load("dkb-beispiel.csv");
    expect(a.bank).toBe("DKB");
    expect(rows).toHaveLength(5);
    expect(rows.find((r) => r.amountCents === 5000)?.payee).toBe("Oma Beispiel");
    expect(rows.find((r) => r.amountCents === -104900)?.payee).toBe("Amazon EU S.a.r.L.");
  });

  it("N26 (Komma, Englisch, ISO-Datum)", () => {
    const { a, rows } = load("n26-beispiel.csv");
    expect(a.bank).toBe("N26");
    expect(a.delimiter).toBe(",");
    expect(rows).toHaveLength(4);
    expect(rows[1]).toMatchObject({ date: "2026-11-12", amountCents: -2490, payee: "McFit GmbH" });
    expect(rows[3].payee).toBe("Muster Café GmbH");
  });

  it("Soll/Haben in getrennten Spalten", () => {
    const a = analyzeCsv("Datum;Text;Soll;Haben\n01.11.2026;Miete;400,00;\n02.11.2026;Gehalt;;900,00\n");
    if ("error" in a) throw new Error(a.error);
    const { rows } = buildRows(a.table, a.headerIndex, a.mapping);
    expect(rows.map((r) => r.amountCents)).toEqual([-40000, 90000]);
  });

  it("meldet Dateien ohne erkennbare Spalten", () => {
    const a = analyzeCsv("foo;bar;baz\n1;2;3\n");
    expect("error" in a ? a.error : a.warning).toBeTruthy();
  });
});

describe("Kategorien", () => {
  const cat = (payee: string, purpose: string, amountCents: number, rules = []) => suggestCategory({ payee, purpose, amountCents }, rules);
  it("erkennt typische Händler", () => {
    expect(cat("REWE SAGT DANKE", "", -2347)).toBe("Lebensmittel");
    expect(cat("NETFLIX INTERNATIONAL B.V.", "", -1399)).toBe("Abos");
    expect(cat("Telefonica Germany GmbH", "Handyrechnung", -1499)).toBe("Handy & Internet");
    expect(cat("DB Vertrieb GmbH", "Deutschlandticket", -5800)).toBe("Mobilität");
    expect(cat("Erika Beispiel", "Miete November WG Zimmer", -42000)).toBe("Wohnen");
    expect(cat("Studierendenwerk Beispielstadt", "BAfoeG Leistung", 45000)).toBe("Einkommen");
    expect(cat("Trade Republic Bank", "Sparplan ETF", -5000)).toBe("Sparen");
  });
  it("vermeidet Fehltreffer bei kurzen Stichwörtern", () => {
    expect(cat("Barmer", "Beitrag", -10000)).toBe("Versicherung");
    expect(cat("Admiral Shop", "", -1000)).toBe("Sonstiges");
  });
  it("Unbekanntes: Eingang = Einkommen, Ausgang = Sonstiges", () => {
    expect(cat("Oma Beispiel", "Taschengeld", 5000)).toBe("Einkommen");
    expect(cat("Unbekannt GmbH", "", -500)).toBe("Sonstiges");
  });
  it("gelernte Regeln haben Vorrang", () => {
    const rules = [{ pattern: payeeKey({ payee: "Erika Beispiel", purpose: "" }), category: "Freizeit" }];
    expect(suggestCategory({ payee: "Erika Beispiel", purpose: "Miete", amountCents: -100 }, rules)).toBe("Freizeit");
  });
  it("Empfänger-Schlüssel ignoriert lange Nummern", () => {
    expect(payeeKey({ payee: "Amazon 302-1234567", purpose: "" })).toBe(payeeKey({ payee: "AMAZON 302-9999999", purpose: "" }));
  });
});

describe("Duplikate", () => {
  it("gleiche Datei ergibt gleiche Fingerabdrücke", () => {
    const { rows } = load("ing-beispiel.csv");
    expect(hashRows(rows)).toEqual(hashRows(load("ing-beispiel.csv").rows));
  });
  it("zwei identische Umsätze am selben Tag bleiben getrennt", () => {
    const { rows } = load("ing-beispiel.csv");
    const coffees = rows.filter((r) => r.payee === "Starbucks Coffee");
    expect(coffees).toHaveLength(2);
    const hashes = hashRows(rows);
    expect(new Set(hashes).size).toBe(hashes.length);
  });
  it("Beschreibung wird gekürzt", () => {
    expect(describeRow({ payee: "A".repeat(80), purpose: "B".repeat(80) }).length).toBeLessThanOrEqual(100);
  });
});
