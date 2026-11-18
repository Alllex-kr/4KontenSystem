"use client";

import { useState } from "react";
import { savePayment } from "@/actions/finance";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { CATEGORIES, MONTHS_SHORT } from "@/lib/constants";

export type PaymentFormValues = {
  id?: string;
  name: string;
  amount: string;
  direction: "IN" | "OUT";
  accountId: string;
  dayOfMonth: number;
  intervalMonths: number;
  startMonth: number;
  category: string;
};

const INTERVALS = [
  { v: 1, l: "monatlich" },
  { v: 2, l: "alle 2 Monate" },
  { v: 3, l: "vierteljährlich" },
  { v: 6, l: "halbjährlich (z. B. Semester)" },
  { v: 12, l: "jährlich" },
];

export function PaymentForm({
  accounts,
  initial,
  onDone,
}: {
  accounts: { id: string; name: string }[];
  initial?: PaymentFormValues;
  onDone?: () => void;
}) {
  const [interval, setInterval] = useState(initial?.intervalMonths ?? 1);
  const [direction, setDirection] = useState<"IN" | "OUT">(initial?.direction ?? "OUT");

  return (
    <ActionForm action={async (p, f) => { const r = await savePayment(p, f); if (r?.success) onDone?.(); return r; }} resetOnSuccess={!initial} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="sm:col-span-2">
        <label className="label">Bezeichnung</label>
        <input name="name" className="input" defaultValue={initial?.name} placeholder="z. B. Miete, Semesterbeitrag, Nebenjob" required />
      </div>
      <div>
        <label className="label">Art</label>
        <select name="direction" className="input" value={direction} onChange={(e) => setDirection(e.target.value as "IN" | "OUT")}>
          <option value="OUT">Ausgabe</option>
          <option value="IN">Einnahme</option>
        </select>
      </div>
      <div>
        <label className="label">Betrag (€)</label>
        <input name="amount" className="input tabular" defaultValue={initial?.amount} placeholder="0,00" inputMode="decimal" required />
      </div>
      <div>
        <label className="label">Konto</label>
        <select name="accountId" className="input" defaultValue={initial?.accountId ?? accounts[0]?.id}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Kategorie</label>
        <select name="category" className="input" defaultValue={initial?.category ?? (direction === "IN" ? "Einkommen" : "Wohnen")} key={direction}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Rhythmus</label>
        <select name="intervalMonths" className="input" value={interval} onChange={(e) => setInterval(Number(e.target.value))}>
          {INTERVALS.map((i) => <option key={i.v} value={i.v}>{i.l}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Tag</label>
          <input name="dayOfMonth" type="number" min={1} max={31} className="input" defaultValue={initial?.dayOfMonth ?? 1} />
        </div>
        <div>
          <label className="label">{interval > 1 ? "Erster Monat" : "Monat"}</label>
          <select name="startMonth" className="input" defaultValue={initial?.startMonth ?? 1} disabled={interval === 1}>
            {MONTHS_SHORT.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          {interval === 1 && <input type="hidden" name="startMonth" value={1} />}
        </div>
      </div>
      <div className="flex items-end sm:col-span-2 lg:col-span-4">
        <SubmitButton>{initial?.id ? "Änderungen speichern" : "Zahlung hinzufügen"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
