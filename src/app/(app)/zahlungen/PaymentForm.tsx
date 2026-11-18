"use client";

import { useState } from "react";
import { savePayment } from "@/actions/finance";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { CATEGORIES } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";
import { monthShort } from "@/lib/format";

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
  { v: 1, l: msg("monatlich") },
  { v: 2, l: msg("alle 2 Monate") },
  { v: 3, l: msg("vierteljährlich") },
  { v: 6, l: msg("halbjährlich (z. B. Semester)") },
  { v: 12, l: msg("jährlich") },
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
  const t = useT();
  const [interval, setInterval] = useState(initial?.intervalMonths ?? 1);
  const [direction, setDirection] = useState<"IN" | "OUT">(initial?.direction ?? "OUT");

  return (
    <ActionForm action={async (p, f) => { const r = await savePayment(p, f); if (r?.success) onDone?.(); return r; }} resetOnSuccess={!initial} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="sm:col-span-2">
        <label className="label">{t("Bezeichnung")}</label>
        <input name="name" className="input" defaultValue={initial?.name} placeholder={t("z. B. Miete, Semesterbeitrag, Nebenjob")} required />
      </div>
      <div>
        <label className="label">{t("Art")}</label>
        <select name="direction" className="input" value={direction} onChange={(e) => setDirection(e.target.value as "IN" | "OUT")}>
          <option value="OUT">{t("Ausgabe")}</option>
          <option value="IN">{t("Einnahme")}</option>
        </select>
      </div>
      <div>
        <label className="label">{t("Betrag (€)")}</label>
        <input name="amount" className="input tabular" defaultValue={initial?.amount} placeholder="0,00" inputMode="decimal" required />
      </div>
      <div>
        <label className="label">{t("Konto")}</label>
        <select name="accountId" className="input" defaultValue={initial?.accountId ?? accounts[0]?.id}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">{t("Kategorie")}</label>
        <select name="category" className="input" defaultValue={initial?.category ?? (direction === "IN" ? t("Einkommen") : t("Wohnen"))} key={direction}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}
        </select>
      </div>
      <div>
        <label className="label">{t("Rhythmus")}</label>
        <select name="intervalMonths" className="input" value={interval} onChange={(e) => setInterval(Number(e.target.value))}>
          {INTERVALS.map((i) => <option key={i.v} value={i.v}>{i.l}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("Tag")}</label>
          <input name="dayOfMonth" type="number" min={1} max={31} className="input" defaultValue={initial?.dayOfMonth ?? 1} />
        </div>
        <div>
          <label className="label">{interval > 1 ? t("Erster Monat") : t("Monat")}</label>
          <select name="startMonth" className="input" defaultValue={initial?.startMonth ?? 1} disabled={interval === 1}>
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthShort(i + 1)}</option>)}
          </select>
          {interval === 1 && <input type="hidden" name="startMonth" value={1} />}
        </div>
      </div>
      <div className="flex items-end sm:col-span-2 lg:col-span-4">
        <SubmitButton>{initial?.id ? t("Änderungen speichern") : t("Zahlung hinzufügen")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
