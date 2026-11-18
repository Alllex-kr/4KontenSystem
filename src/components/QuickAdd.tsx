"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Minus, Plus } from "lucide-react";
import { SuccessBurst } from "./motion/SuccessBurst";
import { useChangeKey } from "@/lib/motion";
import { addTransaction } from "@/actions/finance";
import type { AccountLite } from "@/lib/data";
import { ACCOUNT_META, shortAccountName, type AccountKind } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";

// c = Kategorie-Schlüssel (deutsch, wird gespeichert), Anzeige übersetzt
const QUICK_CATEGORIES = [
  { c: "Essen gehen", e: "🍕" },
  { c: "Lebensmittel", e: "🛒" },
  { c: "Freizeit", e: "🎉" },
  { c: "Shopping", e: "🛍️" },
  { c: "Mobilität", e: "🚲" },
  { c: "Studium", e: "📚" },
  { c: "Gesundheit", e: "💊" },
  { c: "Reisen", e: "✈️" },
  { c: "Abos", e: "📺" },
  { c: "Einkommen", e: "💶" },
  { c: "Sonstiges", e: "✨" },
];

function Submit({ direction }: { direction: "IN" | "OUT" }) {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <button className="btn w-full py-3 text-base" disabled={pending}>
      {pending ? t("Speichern …") : direction === "OUT" ? t("Ausgabe buchen") : t("Einnahme buchen")}
    </button>
  );
}

/** Schnell eine Buchung erfassen: Betrag, Konto, Kategorie, fertig. */
export function QuickAdd({ accounts, onDone, compact = false }: { accounts: AccountLite[]; onDone?: () => void; compact?: boolean }) {
  const t = useT();
  const [state, action] = useActionState(addTransaction, undefined);
  const [direction, setDirection] = useState<"IN" | "OUT">("OUT");
  const [accountId, setAccountId] = useState(accounts.find((a) => a.kind === "FREIZEIT")?.id ?? accounts[0]?.id);
  const [category, setCategory] = useState("Essen gehen");
  const [done, setDone] = useState(false);
  const errorKey = useChangeKey(state);
  const form = useRef<HTMLFormElement>(null);
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  useEffect(() => {
    if (state?.success) {
      form.current?.reset();
      setDone(true);
      const t = setTimeout(() => {
        setDone(false);
        onDone?.();
      }, 1100);
      return () => clearTimeout(t);
    }
  }, [state, onDone]);

  return (
    <form ref={form} action={action} className="space-y-4">
      <input type="hidden" name="direction" value={direction} />
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="date" value={iso} />

      <div className="flex items-stretch gap-2">
        <div className="flex rounded-xl border border-line-strong p-1" role="group" aria-label={t("Art der Buchung")}>
          <button type="button" aria-pressed={direction === "OUT"} onClick={() => setDirection("OUT")} className={`flex items-center gap-1 rounded-lg px-3 text-sm font-bold transition ${direction === "OUT" ? "bg-bad/15 text-bad" : "text-muted"}`}>
            <Minus size={16} />{" "}{t("Ausgabe")}
          </button>
          <button type="button" aria-pressed={direction === "IN"} onClick={() => { setDirection("IN"); setCategory("Einkommen"); }} className={`flex items-center gap-1 rounded-lg px-3 text-sm font-bold transition ${direction === "IN" ? "bg-good/15 text-good" : "text-muted"}`}>
            <Plus size={16} />{" "}{t("Einnahme")}
          </button>
        </div>
        <div className="relative flex-1">
          <input
            name="amount"
            data-autofocus
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            required
            aria-label={t("Betrag in Euro")}
            className={`input tabular h-full pr-9 text-right font-black ${compact ? "text-xl" : "text-2xl sm:text-2xl"}`}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-lg font-bold text-muted">€</span>
        </div>
      </div>

      <div>
        <p className="label">{t("Konto")}</p>
        <div className="grid grid-cols-2 gap-2">
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={accountId === a.id}
              onClick={() => setAccountId(a.id)}
              className="flex min-h-11 items-center gap-2 rounded-xl border px-3 text-left text-sm font-semibold transition"
              style={accountId === a.id ? { borderColor: a.color, background: `color-mix(in srgb, ${a.color} 14%, transparent)` } : { borderColor: "var(--line-strong)" }}
            >
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: a.color }} />
              <span className="truncate">{shortAccountName(a.name, a.kind as AccountKind, t)}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="label">{t("Kategorie")}</p>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {QUICK_CATEGORIES.map(({ c, e }) => (
            <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className="chip">
              <span aria-hidden>{e}</span> {t(c)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="qa-desc">{t("Notiz (optional)")}</label>
        <input id="qa-desc" name="description" className="input" placeholder={t(category)} maxLength={100} />
      </div>

      {state?.error && <p key={errorKey} className="animate-shake rounded-xl bg-bad/10 px-3 py-2 text-sm font-medium text-bad" role="alert">{state.error}</p>}
      {done ? (
        <p className="flex flex-col items-center justify-center gap-1 py-1 font-black text-good" role="status">
          <SuccessBurst size={44} />
          {t("Gebucht!")}
        </p>
      ) : (
        <Submit direction={direction} />
      )}
    </form>
  );
}
