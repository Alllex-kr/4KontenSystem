"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, ArrowRight, CalendarCheck, Check, CheckCircle2, ListChecks, Scale, Vault, Wallet } from "lucide-react";
import { bookSuggestedTransfer, confirmStandingOrders } from "@/actions/planning";
import type { AccountKind } from "@/lib/constants";
import { formatCents, formatDate, parseEuroToCents } from "@/lib/format";
import { ausgleichsUeberweisung, type Ausgleich, type Todo, type TransferSuggestion } from "@/lib/planning";
import { useToast } from "@/components/Toaster";
import { SuccessBurst } from "@/components/motion/SuccessBurst";

export type AccountInfo = Record<AccountKind, { name: string; color: string; balanceCents: number }>;

function useBook() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const book = (t: { from: AccountKind; to: AccountKind; amountCents: number; note?: string }, onDone?: () => void) =>
    start(async () => {
      const r = await bookSuggestedTransfer(t);
      router.refresh();
      toast(r?.error ? { message: r.error, tone: "error" } : { message: r?.success ?? "Gebucht" });
      if (!r?.error) onDone?.();
    });
  return { book, pending };
}

function Dot({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />;
}

// ------------------------------------------------------------------ Checkliste

export function TodoList({ todos, transfers, accounts, compact = false }: { todos: Todo[]; transfers: TransferSuggestion[]; accounts: AccountInfo; compact?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { book, pending } = useBook();
  const [confirming, startConfirm] = useTransition();

  if (todos.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-good/10 p-4 text-good">
        <CheckCircle2 size={22} className="shrink-0" />
        <div>
          <p className="font-black">Alles erledigt 🍀</p>
          <p className="text-sm opacity-90">Daueraufträge, Puffer und Rücklagen passen. Nichts zu tun.</p>
        </div>
      </div>
    );
  }

  const sev = { high: "border-bad/40 bg-bad/5", medium: "border-warn/40 bg-warn/5", low: "border-line" };
  const icon = { ausgleich: Scale, transfer: ArrowRight, orders: CalendarCheck, balance: Wallet, reserve: Vault, due: CalendarCheck };

  return (
    <ul className="stagger space-y-2">
      {todos.slice(0, compact ? 5 : undefined).map((t, i) => {
        const Icon = icon[t.kind];
        const transferIdx = t.kind === "transfer" && t.id.startsWith("transfer-") ? Number(t.id.split("-")[1]) : -1;
        const suggestion =
          t.kind === "ausgleich"
            ? transfers.find((x) => x.to === "FIXKOSTEN")
            : transferIdx >= 0
              ? transfers.filter((x) => !(x.to === "FIXKOSTEN" && todos.some((y) => y.kind === "ausgleich")))[transferIdx]
              : undefined;
        return (
          <li key={t.id + i} className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border p-3 ${sev[t.severity]}`}>
            <Icon size={18} className={`shrink-0 ${t.severity === "high" ? "text-bad" : t.severity === "medium" ? "text-warn" : "text-muted"}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{t.title}</p>
              {t.detail && <p className="text-xs text-muted">{t.detail}</p>}
            </div>
            {suggestion && (
              <button className="btn min-h-9 px-3 text-xs" disabled={pending} onClick={() => book(suggestion)}>
                <Check size={14} /> {t.kind === "ausgleich" ? `Aus ${accounts[suggestion.from].name.replace(/konto$/i, "")} buchen` : "Erledigt"}
              </button>
            )}
            {t.kind === "ausgleich" && !suggestion && (
              <Link href="/konten#ausgleich" className="btn-ghost min-h-9 px-3 text-xs">Ausgleich</Link>
            )}
            {t.kind === "orders" && (
              <button
                className="btn min-h-9 px-3 text-xs"
                disabled={confirming}
                onClick={() =>
                  startConfirm(async () => {
                    const r = await confirmStandingOrders();
                    router.refresh();
                    toast({ message: r?.success ?? "Gemerkt" });
                  })
                }
              >
                <Check size={14} /> Bei der Bank erledigt
              </button>
            )}
            {t.kind === "balance" && <Link href="/konten" className="btn-ghost min-h-9 px-3 text-xs">Abgleichen</Link>}
            {(t.kind === "reserve" || t.kind === "due") && <Link href="/ruecklagen" className="btn-ghost min-h-9 px-3 text-xs">Rücklagen</Link>}
          </li>
        );
      })}
      {compact && todos.length > 5 && (
        <li className="text-center text-xs text-muted">
          und {todos.length - 5} weitere · <Link href="/konten" className="font-bold text-accent">alle ansehen</Link>
        </li>
      )}
    </ul>
  );
}

// ------------------------------------------------------------------ Ausgleich & Zusatz-Zahlung

export function AusgleichPanel({ ausgleich, minBufferCents, accounts, suggestedSource }: { ausgleich: Ausgleich; minBufferCents: number; accounts: AccountInfo; suggestedSource: AccountKind | null }) {
  const { book, pending } = useBook();
  const [zusatz, setZusatz] = useState("");
  const [mode, setMode] = useState<"out" | "in">(ausgleich.requiredInCents > 0 ? "in" : "out");
  const [other, setOther] = useState<AccountKind>(suggestedSource ?? (ausgleich.requiredInCents > 0 ? "NOTGROSCHEN" : "FREIZEIT"));
  const [done, setDone] = useState(false);

  const zusatzCents = useMemo(() => {
    const c = parseEuroToCents(zusatz || "0");
    if (c === null) return null;
    return mode === "in" ? c : -c;
  }, [zusatz, mode]);
  const result = zusatzCents === null ? { transferCents: 0, error: "Bitte einen gültigen Betrag eingeben." } : ausgleichsUeberweisung(ausgleich, zusatzCents);
  const amount = Math.abs(result.transferCents);
  const toFix = result.transferCents > 0;
  const from: AccountKind = toFix ? other : "FIXKOSTEN";
  const to: AccountKind = toFix ? "FIXKOSTEN" : other;

  return (
    <div className="space-y-4" id="ausgleich">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface-2 p-3">
          <p className="text-xs font-bold text-muted">Tiefster Stand (Prognose)</p>
          <p className={`tabular text-lg font-black ${ausgleich.lowestCents < minBufferCents ? "text-bad" : ""}`}>{formatCents(ausgleich.lowestCents)}</p>
          <p className="text-xs text-muted">am {formatDate(ausgleich.lowestDate)}</p>
        </div>
        <div className="rounded-2xl bg-surface-2 p-3">
          <p className="text-xs font-bold text-muted">{ausgleich.requiredInCents > 0 ? "Fehlbetrag" : "Max. Auszahlung"}</p>
          <p className={`tabular text-lg font-black ${ausgleich.requiredInCents > 0 ? "text-bad" : "text-good"}`}>
            {formatCents(ausgleich.requiredInCents > 0 ? ausgleich.requiredInCents : ausgleich.maxPayoutCents)}
          </p>
          <p className="text-xs text-muted">Mindestpuffer {formatCents(minBufferCents)}</p>
        </div>
      </div>

      <div>
        <p className="label">Zusatz-Zahlung (optional)</p>
        <div className="flex gap-2">
          <div className="flex shrink-0 rounded-xl border border-line-strong p-1" role="group" aria-label="Richtung">
            <button type="button" aria-pressed={mode === "in"} onClick={() => setMode("in")} className={`rounded-lg px-2.5 text-xs font-bold transition ${mode === "in" ? "bg-good/15 text-good" : "text-muted"}`}>+ Einzahlen</button>
            <button type="button" aria-pressed={mode === "out"} onClick={() => setMode("out")} className={`rounded-lg px-2.5 text-xs font-bold transition ${mode === "out" ? "bg-bad/15 text-bad" : "text-muted"}`}>− Auszahlen</button>
          </div>
          <input className="input tabular" inputMode="decimal" placeholder="0,00 €" value={zusatz} onChange={(e) => setZusatz(e.target.value)} aria-label="Zusatz-Zahlung in Euro" />
        </div>
        <p className="mt-1 text-xs text-muted">Zum Beispiel Geld für eine größere Anschaffung vom Fixkostenkonto nehmen oder etwas extra einzahlen.</p>
      </div>

      <div>
        <label className="label" htmlFor="gegenkonto">Gegenkonto</label>
        <select id="gegenkonto" className="input" value={other} onChange={(e) => setOther(e.target.value as AccountKind)}>
          {(["SPAREN", "NOTGROSCHEN", "FREIZEIT"] as AccountKind[]).map((k) => (
            <option key={k} value={k}>{accounts[k].name} ({formatCents(accounts[k].balanceCents)})</option>
          ))}
        </select>
      </div>

      {result.error ? (
        <p className="animate-shake rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{result.error}</p>
      ) : amount === 0 ? (
        <p className="rounded-xl bg-good/10 px-3 py-2 text-sm font-bold text-good">Kein Ausgleich nötig ✓</p>
      ) : done ? (
        <div className="flex items-center gap-3 rounded-xl bg-good/10 px-3 py-2 font-bold text-good"><SuccessBurst size={36} /> Gebucht!</div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/40 bg-accent-soft p-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-muted">Überweisungsbetrag</p>
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
              <Dot color={accounts[from].color} /> {accounts[from].name} <ArrowRight size={14} /> <Dot color={accounts[to].color} /> {accounts[to].name}
            </p>
          </div>
          <span className="tabular text-xl font-black">{formatCents(amount)}</span>
          <button className="btn w-full sm:w-auto" disabled={pending} onClick={() => book({ from, to, amountCents: amount, note: toFix ? "Ausgleichszahlung" : "Auszahlung vom Fixkostenkonto" }, () => setDone(true))}>
            <Check size={16} /> Als erledigt buchen
          </button>
        </div>
      )}
      <p className="text-xs text-muted">„Als erledigt buchen“ verbucht die Umbuchung in Vierklee. Die echte Überweisung machst du in deiner Bank-App.</p>
    </div>
  );
}

// ------------------------------------------------------------------ Notwendige Überweisungen

export function TransfersPanel({
  transfers,
  uncovered,
  accounts,
}: {
  transfers: TransferSuggestion[];
  uncovered: { to: AccountKind; amountCents: number; reason: string }[];
  accounts: AccountInfo;
}) {
  const { book, pending } = useBook();
  if (!transfers.length && !uncovered.length) {
    return <p className="flex items-center gap-2 rounded-xl bg-good/10 px-3 py-2 text-sm font-bold text-good"><CheckCircle2 size={16} /> Alle Konten sind auf Soll-Stand. Keine Überweisung nötig.</p>;
  }
  return (
    <ul className="stagger space-y-2">
      {transfers.map((t, i) => (
        <li key={i} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line p-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
              <Dot color={accounts[t.from].color} /> {accounts[t.from].name} <ArrowRight size={14} className="text-subtle" /> <Dot color={accounts[t.to].color} /> {accounts[t.to].name}
            </p>
            <p className="text-xs text-muted">{t.reason}</p>
          </div>
          <span className="tabular text-lg font-black">{formatCents(t.amountCents)}</span>
          <button className="btn min-h-9 px-3 text-xs" disabled={pending} onClick={() => book(t)}><Check size={14} /> Erledigt</button>
        </li>
      ))}
      {uncovered.map((u, i) => (
        <li key={`u${i}`} className="flex items-start gap-3 rounded-2xl border border-warn/40 bg-warn/5 p-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" />
          <div className="text-sm">
            <p className="font-bold">{accounts[u.to].name}: {formatCents(u.amountCents)} fehlen</p>
            <p className="text-xs text-muted">{u.reason}. Kein Konto hat gerade genug übrig. Das gleicht sich mit den nächsten Daueraufträgen aus, oder du zahlst etwas ein.</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ Daueraufträge

export function OrdersPanel({
  recommended,
  confirmed,
  validFrom,
  accounts,
  transferDay,
}: {
  recommended: Record<"SPAREN" | "NOTGROSCHEN" | "FREIZEIT", number>;
  confirmed: Record<"SPAREN" | "NOTGROSCHEN" | "FREIZEIT", number> | null;
  validFrom: string | null;
  accounts: AccountInfo;
  transferDay: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const kinds = ["NOTGROSCHEN", "SPAREN", "FREIZEIT"] as const;
  const changed = kinds.filter((k) => !confirmed || Math.abs(confirmed[k] - recommended[k]) >= 100);
  const now = new Date();
  const nextFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line text-sm">
        {kinds.map((k) => {
          const diff = changed.includes(k);
          return (
            <li key={k} className="flex items-center gap-3 py-2.5">
              <Dot color={accounts[k].color} />
              <span className="min-w-0 flex-1 truncate font-semibold">{accounts.FIXKOSTEN.name.replace(/konto$/i, "")} → {accounts[k].name}</span>
              {confirmed && diff && <span className="tabular text-xs text-muted line-through">{formatCents(confirmed[k])}</span>}
              <span className={`tabular font-black ${diff ? "text-accent" : ""}`}>{formatCents(recommended[k])}</span>
            </li>
          );
        })}
      </ul>
      {changed.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-warn/40 bg-warn/5 p-3">
          <ListChecks size={18} className="shrink-0 text-warn" />
          <p className="min-w-0 flex-1 text-sm">
            <b>{confirmed ? "Daueraufträge anpassen" : "Daueraufträge einrichten"}</b>, jeweils am {transferDay}., gültig ab {formatDate(nextFirst)}.
          </p>
          <button
            className="btn min-h-9 px-3 text-xs"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await confirmStandingOrders();
                router.refresh();
                toast({ message: r?.success ?? "Gemerkt" });
              })
            }
          >
            <Check size={14} /> Bei der Bank erledigt
          </button>
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-xl bg-good/10 px-3 py-2 text-sm font-bold text-good">
          <CheckCircle2 size={16} /> Deine Daueraufträge passen{validFrom ? ` (gültig ab ${formatDate(validFrom)})` : ""}.
        </p>
      )}
    </div>
  );
}
