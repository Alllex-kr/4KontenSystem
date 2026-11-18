"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, FileSpreadsheet, Info, RotateCcw, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { checkDuplicates, importTransactions, type ImportResult } from "@/actions/import";
import { aiCategorizeRows } from "@/actions/ai";
import {
  FIELD_LABELS,
  analyzeCsv,
  autoMap,
  buildRows,
  describe,
  hashRows,
  latestBalance,
  payeeKey,
  suggestCategoryDetailed,
  type CsvAnalysis,
  type Field,
  type ImportRuleLike,
  type Mapping,
} from "@/lib/csvImport";
import { ACCOUNT_META, shortAccountName, CATEGORIES, type AccountKind, type Category } from "@/lib/constants";
import { centsToInput, formatCents, parseEuroToCents } from "@/lib/format";
import type { AccountLite } from "@/lib/data";
import { Alert, Card } from "@/components/ui";
import { SuccessBurst } from "@/components/motion/SuccessBurst";
import { useT } from "@/lib/i18n/client";
import { rich } from "@/lib/i18n/rich";

const MAX_BYTES = 5 * 1024 * 1024;
const PAGE = 150;
const SAMPLES = [
  { file: "sparkasse-beispiel.csv", label: "Sparkasse" },
  { file: "ing-beispiel.csv", label: "ING" },
  { file: "dkb-beispiel.csv", label: "DKB" },
  { file: "n26-beispiel.csv", label: "N26" },
];
const FIELDS: Field[] = ["date", "amount", "payee", "payee2", "purpose", "balance", "debit", "credit"];
const isoToDe = (iso: string) => iso.split("-").reverse().join(".");

type Filter = "new" | "all" | "dupes";

export type AiInfo = { enabled: boolean; available: boolean; remaining: number };

export function ImportClient({ accounts, rules, ai }: { accounts: AccountLite[]; rules: ImportRuleLike[]; ai: AiInfo }) {
  const t = useT();
  const [fileName, setFileName] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<CsvAnalysis | null>(null);
  const [headerIndex, setHeaderIndex] = useState(0);
  const [mapping, setMapping] = useState<Mapping>({});
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(accounts.find((a) => a.kind === "FIXKOSTEN")?.id ?? accounts[0]?.id ?? "");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [dupes, setDupes] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);
  const [filter, setFilter] = useState<Filter>("new");
  const [shown, setShown] = useState(PAGE);
  const [balanceMode, setBalanceMode] = useState<"keep" | "add" | "set">("keep");
  const [balanceInput, setBalanceInput] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();
  // KI-Vorschläge (Claude) für Umsätze ohne passende Regel
  const [aiCats, setAiCats] = useState<Record<string, string>>({});
  const [aiState, setAiState] = useState<{ status: "idle" | "running" | "done" | "error"; count?: number; message?: string }>({ status: "idle" });
  const aiRunFor = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // ---------- Datei einlesen (passiert komplett im Browser)
  const load = (buf: ArrayBuffer, name: string) => {
    setError(null);
    setResult(null);
    if (buf.byteLength > MAX_BYTES) return setError(t("Die Datei ist größer als 5 MB. Exportiere bitte einen kürzeren Zeitraum."));
    const a = analyzeCsv(buf);
    if ("error" in a) {
      setAnalysis(null);
      return setError(t(a.error));
    }
    setFileName(name);
    setAnalysis(a);
    setHeaderIndex(a.headerIndex);
    setMapping(a.mapping);
    setOverrides({});
    setAiCats({});
    setAiState({ status: "idle" });
    aiRunFor.current = null;
    setExcluded(new Set());
    setFilter("new");
    setShown(PAGE);
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    load(await f.arrayBuffer(), f.name);
  };
  const loadSample = async (file: string) => {
    const res = await fetch(`/beispiele/${file}`);
    if (!res.ok) return setError(t("Beispieldatei konnte nicht geladen werden."));
    load(await res.arrayBuffer(), file);
  };
  const reset = () => {
    setAnalysis(null);
    setFileName(null);
    setResult(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  // ---------- Abgeleitete Daten
  const built = useMemo(() => (analysis ? buildRows(analysis.table, headerIndex, mapping) : { rows: [], skipped: 0 }), [analysis, headerIndex, mapping]);
  const hashes = useMemo(() => hashRows(built.rows), [built]);
  const detailed = useMemo(() => built.rows.map((r) => suggestCategoryDetailed(r, rules)), [built, rules]);
  const suggestions = useMemo(() => detailed.map((d) => d.category), [detailed]);
  const bankBalance = useMemo(() => latestBalance(built.rows), [built]);
  const header = analysis?.table[headerIndex] ?? [];
  const dateRange = useMemo(() => {
    if (!built.rows.length) return null;
    const ds = built.rows.map((r) => r.date).sort();
    return `${isoToDe(ds[0])} – ${isoToDe(ds[ds.length - 1])}`;
  }, [built]);

  // Kontostand aus der Saldo-Spalte vorschlagen
  useEffect(() => {
    if (bankBalance !== null) {
      setBalanceMode("set");
      setBalanceInput(centsToInput(bankBalance));
    } else {
      setBalanceMode("keep");
      setBalanceInput("");
    }
  }, [bankBalance]);

  // Duplikate prüfen, sobald Datei oder Konto sich ändern
  useEffect(() => {
    if (!hashes.length || !accountId) return setDupes(new Set());
    let cancelled = false;
    setChecking(true);
    checkDuplicates({ accountId, hashes })
      .then((found) => !cancelled && setDupes(new Set(found)))
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [hashes, accountId]);

  // Neue Umsätze ohne Regel/Stichwort automatisch von Claude einordnen lassen (nur mit Opt-in)
  useEffect(() => {
    if (!ai.enabled || !ai.available || checking || !hashes.length) return;
    const candidates = built.rows
      .map((row, i) => ({ row, hash: hashes[i], source: detailed[i]?.source }))
      .filter((x) => x.source === "fallback" && !dupes.has(x.hash));
    const signature = `${accountId}|${candidates.map((c) => c.hash).join(",")}`;
    if (!candidates.length || aiRunFor.current === signature) return;
    aiRunFor.current = signature;
    setAiState({ status: "running", count: candidates.length });
    aiCategorizeRows(candidates.map((c) => ({ id: c.hash, payee: c.row.payee, purpose: c.row.purpose, amountCents: c.row.amountCents })))
      .then((r) => {
        setAiCats(r.categories);
        const n = Object.keys(r.categories).length;
        if (r.error && !n) setAiState({ status: "error", message: t(r.error) });
        else setAiState({ status: "done", count: n, message: r.error ? t(r.error) : r.skippedByLimit ? t("{n} wegen Monatslimit nicht eingeordnet.", { n: r.skippedByLimit }) : undefined });
      })
      .catch(() => setAiState({ status: "error", message: t("Die KI-Kategorisierung ist fehlgeschlagen.") }));
  }, [ai.enabled, ai.available, checking, hashes, dupes, built, detailed, accountId]);

  const items = built.rows.map((row, i) => {
    const hash = hashes[i];
    const aiCat = aiCats[hash];
    const suggested = aiCat ?? suggestions[i];
    const category = overrides[hash] ?? suggested;
    const dupe = dupes.has(hash);
    return { row, hash, suggested, category, dupe, fromAi: Boolean(aiCat), selected: !dupe && !excluded.has(hash) };
  });
  const selected = items.filter((it) => it.selected);
  const visible = items.filter((it) => (filter === "new" ? !it.dupe : filter === "dupes" ? it.dupe : true));
  const income = selected.filter((it) => it.row.amountCents > 0).reduce((s, it) => s + it.row.amountCents, 0);
  const expense = Math.abs(selected.filter((it) => it.row.amountCents < 0).reduce((s, it) => s + it.row.amountCents, 0));
  const newCount = items.filter((it) => !it.dupe).length;
  const changedCount = selected.filter((it) => it.category !== it.suggested).length;
  const missingRequired = mapping.date === undefined || (mapping.amount === undefined && mapping.debit === undefined && mapping.credit === undefined);
  const account = accounts.find((a) => a.id === accountId);

  const toggle = (hash: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  const allNewSelected = items.filter((it) => !it.dupe).every((it) => it.selected);
  const toggleAll = () => setExcluded(allNewSelected ? new Set(items.filter((it) => !it.dupe).map((it) => it.hash)) : new Set());

  const submit = () => {
    setError(null);
    let balanceCents: number | undefined;
    if (balanceMode === "set") {
      const c = parseEuroToCents(balanceInput);
      if (c === null) return setError(t("Bitte einen gültigen Kontostand eingeben, z. B. 1.234,56."));
      balanceCents = c;
    }
    start(async () => {
      const res = await importTransactions({
        accountId,
        balanceMode,
        balanceCents,
        rows: selected.map((it) => ({
          hash: it.hash,
          date: it.row.date,
          amountCents: it.row.amountCents,
          description: describe(it.row),
          category: (CATEGORIES as readonly string[]).includes(it.category) ? (it.category as Category) : "Sonstiges",
          // Deine Korrektur (user) oder Claudes Vorschlag (ai) als Regel merken → nächstes Mal ohne KI-Anfrage
          learnPattern: (it.category !== it.suggested || it.fromAi) && payeeKey(it.row).length >= 2 ? payeeKey(it.row) : undefined,
          learnSource: it.category !== it.suggested ? ("user" as const) : it.fromAi ? ("ai" as const) : undefined,
        })),
      });
      if (res.error) setError(res.error);
      else setResult(res);
    });
  };

  // ---------- Ergebnis
  if (result) {
    return (
      <Card>
        <div className="flex flex-col items-center py-6 text-center">
          <SuccessBurst size={64} />
          <h2 className="mt-3 text-2xl font-black">{result.imported}{" "}{t("Buchungen importiert 🎉")}</h2>
          <p className="mt-1 text-muted">
            {result.skipped ? t("{skipped} waren schon vorhanden und wurden übersprungen. ", { skipped: result.skipped }) : ""}
            {result.learned ? (result.learned === 1 ? t("1 neue Zuordnung gelernt.") : t("{n} neue Zuordnungen gelernt.", { n: result.learned })) : ""}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/transaktionen" className="btn">{t("Zu den Buchungen")}</Link>
            <button onClick={reset} className="btn-ghost"><Upload size={16} />{" "}{t("Weitere Datei")}</button>
          </div>
        </div>
      </Card>
    );
  }

  // ---------- Datei wählen
  if (!analysis) {
    return (
      <div className="space-y-4">
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void onFile(e.dataTransfer.files[0]); }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-12 text-center transition duration-300 ${
            dragging ? "scale-[1.02] border-accent bg-accent-soft" : "border-line-strong bg-surface hover:border-accent"
          }`}
        >
          <span className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent transition-transform duration-500 ease-[var(--ease-spring)] ${dragging ? "-translate-y-1 scale-110" : ""}`}>
            <FileSpreadsheet size={28} />
          </span>
          <span className="mt-4 text-lg font-black">{t("CSV-Datei auswählen")}</span>
          <span className="mt-1 text-sm text-muted">{t("oder hierher ziehen · max. 5 MB")}</span>
          <span className="btn mt-5"><Upload size={17} />{" "}{t("Datei wählen")}</span>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.txt,text/csv,text/plain,application/vnd.ms-excel"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
            data-testid="csv-input"
          />
        </label>

        {error && <Alert>{error}</Alert>}

        <p className="flex items-start gap-2 text-sm text-muted">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-good" />
          {t("Die Datei wird nur in deinem Browser gelesen. An FinanzKlee gehen ausschließlich die Umsätze, die du am Ende importierst.")}
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <Card title={t("Noch keine Datei zur Hand?")} subtitle={t("Probier den Import mit einer Beispieldatei aus")}>
            <div className="flex flex-wrap gap-2">
              {SAMPLES.map((s) => (
                <button key={s.file} onClick={() => void loadSample(s.file)} className="chip">
                  <Sparkles size={14} /> {s.label}
                </button>
              ))}
            </div>
          </Card>
          <details className="card group">
            <summary className="flex cursor-pointer list-none items-center justify-between font-bold">
              {t("So bekommst du die CSV-Datei")}
              <ChevronDown size={18} className="transition group-open:rotate-180" />
            </summary>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li><b className="text-fg">{t("Sparkasse:")}</b>{" "}{t("Umsätze → Export → „CSV-CAMT V2“")}</li>
              <li><b className="text-fg">{t("ING:")}</b>{" "}{t("Umsätze → Zeitraum wählen → Export als CSV")}</li>
              <li><b className="text-fg">{t("DKB:")}</b>{" "}{t("Umsätze → Download → CSV")}</li>
              <li><b className="text-fg">{t("Volksbank / Raiffeisen:")}</b>{" "}{t("Umsätze → Exportieren → CSV")}</li>
              <li><b className="text-fg">N26:</b>{" "}{t("Web-App → Kontoauszüge → CSV herunterladen")}</li>
              <li className="text-xs">{t("Die Menüs heißen je nach Bank und App-Version etwas anders. Meist findest du den Export in der Web-Version des Online-Bankings.")}</li>
            </ul>
          </details>
        </div>
      </div>
    );
  }

  // ---------- Vorschau
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent"><FileSpreadsheet size={22} /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-black">{fileName}</p>
            <p className="text-xs text-muted">
              {analysis.bank ? t("{bank} erkannt · ", { bank: analysis.bank }) : ""}
              {built.rows.length}{" "}{t("Umsätze")}{dateRange ? ` · ${dateRange}` : ""} · {analysis.encoding}
            </p>
          </div>
          <button onClick={reset} className="btn-ghost"><RotateCcw size={16} />{" "}{t("Andere Datei")}</button>
        </div>

        {analysis.warning && <div className="mt-4"><Alert>{analysis.warning}</Alert></div>}

        <details className="group mt-4 rounded-xl border border-line" open={missingRequired}>
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-bold">
            {t("Spalten zuordnen")}{" "}{missingRequired ? <span className="text-bad">{t("(Datum oder Betrag fehlt)")}</span> : <span className="font-normal text-muted">{t("(automatisch erkannt)")}</span>}
            <ChevronDown size={18} className="transition group-open:rotate-180" />
          </summary>
          <div className="grid gap-3 border-t border-line p-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label" htmlFor="hdr">{t("Kopfzeile in Zeile")}</label>
              <input
                id="hdr"
                type="number"
                min={1}
                max={analysis.table.length}
                value={headerIndex + 1}
                onChange={(e) => {
                  const i = Math.max(0, Math.min(analysis.table.length - 1, Number(e.target.value) - 1));
                  setHeaderIndex(i);
                  setMapping(autoMap(analysis.table[i]));
                }}
                className="input"
              />
            </div>
            {FIELDS.map((f) => (
              <div key={f}>
                <label className="label" htmlFor={`map-${f}`}>{t(FIELD_LABELS[f])}{f === "date" || f === "amount" ? " *" : ""}</label>
                <select
                  id={`map-${f}`}
                  className="input"
                  value={mapping[f] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value === "" ? undefined : Number(e.target.value) }))}
                >
                  <option value="">{t("— nicht vorhanden —")}</option>
                  {header.map((h, i) => (
                    <option key={i} value={i}>{h || t("Spalte {v0}", { v0: i + 1 })}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </details>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title={t("In welches Konto?")} subtitle={t("Meist ist dein Girokonto das Fixkostenkonto")} className="lg:col-span-1">
          <div className="grid grid-cols-2 gap-2">
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={accountId === a.id}
                onClick={() => setAccountId(a.id)}
                className="flex min-h-11 items-center gap-2 rounded-xl border px-3 text-left text-sm font-bold transition"
                style={accountId === a.id ? { borderColor: a.color, background: `color-mix(in srgb, ${a.color} 14%, transparent)` } : { borderColor: "var(--line-strong)" }}
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: a.color }} />
                <span className="truncate">{shortAccountName(a.name, a.kind as AccountKind, t)}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card title={t("Kontostand")} subtitle={t("{v0} nach dem Import", { v0: account?.name ?? "Konto" })} className="lg:col-span-2">
          <div className="space-y-2 text-sm" role="radiogroup">
            <label className="flex items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
              <input type="radio" name="bal" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={balanceMode === "set"} onChange={() => setBalanceMode("set")} />
              <span className="flex-1">
                <span className="font-bold">{t("Auf aktuellen Stand laut Bank setzen")}</span>
                {balanceMode === "set" && (
                  <span className="mt-2 flex items-center gap-2">
                    <input
                      className="input tabular max-w-40"
                      inputMode="decimal"
                      placeholder="1.234,56"
                      value={balanceInput}
                      onChange={(e) => setBalanceInput(e.target.value)}
                      aria-label={t("Aktueller Kontostand in Euro")}
                    />
                    <span className="text-muted">€{bankBalance !== null ? t(" (aus der Datei)") : ""}</span>
                  </span>
                )}
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
              <input type="radio" name="bal" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={balanceMode === "add"} onChange={() => setBalanceMode("add")} />
              <span>
                <span className="font-bold">{t("Neue Umsätze verrechnen")}</span>{" "}
                <span className="tabular text-muted">({formatCents(income - expense)})</span>
                <span className="block text-xs text-muted">{t("Wenn du den Kontostand in FinanzKlee seit diesen Umsätzen nicht abgeglichen hast.")}</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
              <input type="radio" name="bal" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={balanceMode === "keep"} onChange={() => setBalanceMode("keep")} />
              <span className="font-bold">{t("Kontostand nicht ändern")}</span>
            </label>
          </div>
        </Card>
      </div>

      <Card
        title={t("Vorschau")}
        subtitle={checking ? t("Prüfe auf Duplikate …") : t("{newCount} neu · {old} schon importiert", { newCount, old: items.length - newCount }) + (built.skipped ? t(" · {n} Zeilen ohne Datum/Betrag übersprungen", { n: built.skipped }) : "")}
        action={
          <div className="flex rounded-xl border border-line p-0.5 text-xs font-bold" role="tablist">
            {(["new", "all", "dupes"] as Filter[]).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => { setFilter(f); setShown(PAGE); }}
                className={`rounded-lg px-2.5 py-1.5 ${filter === f ? "bg-accent text-accent-fg" : "text-muted"}`}
              >
                {f === "new" ? t("Neu") : f === "all" ? t("Alle") : t("Duplikate")}
              </button>
            ))}
          </div>
        }
      >
        {built.rows.length === 0 ? (
          <Alert>{t("Mit dieser Spaltenzuordnung wurden keine Umsätze gefunden. Prüfe oben Datum und Betrag.")}</Alert>
        ) : newCount === 0 && !checking && filter === "new" ? (
          <Alert tone="good">
            {t("Alle {n} Umsätze dieser Datei sind schon in „{account}“ importiert. 👍", { n: items.length, account: account?.name })}{" "}
            <button onClick={() => setFilter("all")} className="font-bold underline">{t("Trotzdem ansehen")}</button>
          </Alert>
        ) : (
          <>
            {aiState.status !== "idle" && (
              <p
                className={`animate-fade-down mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
                  aiState.status === "error" ? "bg-warn/10 text-warn" : "bg-accent-soft text-accent"
                }`}
                role="status"
              >
                <Sparkles size={16} className={aiState.status === "running" ? "animate-pulse" : ""} />
                {aiState.status === "running"
                  ? t("Claude ordnet {count} Umsätze ohne Regel ein …", { count: aiState.count })
                  : aiState.status === "done"
                    ? t("Claude hat {count} Umsätze eingeordnet. Prüf die markierten Kategorien kurz.{v1}", { count: aiState.count, v1: aiState.message ? ` ${aiState.message}` : "" })
                    : `${t("KI")}: ${aiState.message}`}
              </p>
            )}
            {!ai.enabled && ai.available && detailed.some((d) => d.source === "fallback") && (
              <p className="mb-3 text-xs text-muted">
                {rich(t("Tipp: Unter <link>Einstellungen</link> kannst du Claude Umsätze ohne Regel automatisch einordnen lassen."), { link: (x) => <Link href="/einstellungen#ki" className="font-bold text-accent">{x}</Link> })}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
              <label className="flex items-center gap-2 text-sm font-bold">
                <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={allNewSelected && newCount > 0} onChange={toggleAll} disabled={newCount === 0} />
                {t("Alle neuen auswählen")}
              </label>
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Info size={14} />{" "}{t("Kategorie ändern = FinanzKlee merkt sich das für diesen Empfänger")}
              </p>
            </div>
            <ul className="stagger divide-y divide-line">
              {visible.slice(0, shown).map((it) => (
                <li key={it.hash} className={`grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 py-3 sm:grid-cols-[auto_1fr_auto_11rem] ${it.dupe ? "opacity-55" : ""}`}>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[var(--accent)]"
                    checked={it.selected}
                    disabled={it.dupe}
                    onChange={() => toggle(it.hash)}
                    aria-label={t("{v0} auswählen", { v0: it.row.payee || it.row.purpose })}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-bold">{it.row.payee || it.row.purpose || t("Umsatz")}</p>
                    <p className="truncate text-xs text-muted">
                      {isoToDe(it.row.date)}
                      {it.row.payee && it.row.purpose ? ` · ${it.row.purpose}` : ""}
                      {it.dupe && <span className="ml-1 rounded-full bg-surface-2 px-1.5 py-0.5 font-bold">{t("schon importiert")}</span>}
                    </p>
                  </div>
                  <span className={`tabular text-right font-black ${it.row.amountCents < 0 ? "text-bad" : "text-good"}`}>{formatCents(it.row.amountCents)}</span>
                  <div className="relative col-span-3 col-start-1 sm:col-span-1 sm:col-start-auto">
                    {it.fromAi && it.category === it.suggested && (
                      <span className="pointer-events-none absolute -top-2 right-2 z-10 flex items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-black text-accent-fg" title={t("Vorschlag von Claude")}>
                        <Sparkles size={10} />{" "}{t("KI")}
                      </span>
                    )}
                    <select
                      className={`input min-h-9 py-1 sm:min-h-9 ${it.category !== it.suggested ? "border-accent" : ""}`}
                      value={it.category}
                      disabled={it.dupe}
                      onChange={(e) => setOverrides((o) => ({ ...o, [it.hash]: e.target.value }))}
                      aria-label={t("Kategorie")}
                    >
                      {!(CATEGORIES as readonly string[]).includes(it.category) && <option value={it.category}>{t(it.category)}</option>}
                      {CATEGORIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}
                    </select>
                  </div>
                </li>
              ))}
            </ul>
            {visible.length > shown && (
              <button onClick={() => setShown((s) => s + PAGE)} className="btn-ghost mt-3 w-full">
                {t("Weitere {n} anzeigen ({left} übrig)", { n: Math.min(PAGE, visible.length - shown), left: visible.length - shown })}
              </button>
            )}
            {visible.length === 0 && <p className="py-6 text-center text-sm text-muted">{t("Keine Umsätze in dieser Ansicht.")}</p>}
          </>
        )}
      </Card>

      {error && <Alert>{error}</Alert>}

      {/* Import-Leiste: bleibt am unteren Rand sichtbar */}
      <div className="sticky bottom-20 z-20 lg:bottom-4">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-xl backdrop-blur">
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-black">{selected.length}{" "}{t("ausgewählt")}</p>
            <p className="tabular text-xs text-muted">
              <span className="text-good">+{formatCents(income)}</span> · <span className="text-bad">−{formatCents(expense)}</span>
              {changedCount > 0 && (changedCount === 1 ? t(" · 1 Kategorie geändert") : t(" · {n} Kategorien geändert", { n: changedCount }))}
            </p>
          </div>
          <button onClick={submit} disabled={pending || selected.length === 0 || missingRequired} className="btn">
            <Upload size={17} /> {pending ? t("Importiere …") : t("{length} importieren", { length: selected.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
