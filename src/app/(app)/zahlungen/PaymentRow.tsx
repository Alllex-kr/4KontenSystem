"use client";

import { useState } from "react";
import { Pencil, Pause, Play, Trash2 } from "lucide-react";
import { deletePaymentUndoable, restorePayment, togglePayment } from "@/actions/finance";
import { UndoDelete } from "@/components/UndoDelete";
import { PaymentForm, type PaymentFormValues } from "./PaymentForm";

export function PaymentRow({
  values,
  accounts,
  summary,
  active,
}: {
  values: PaymentFormValues & { id: string };
  accounts: { id: string; name: string }[];
  summary: React.ReactNode;
  active: boolean;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <li className={`py-3 ${active ? "" : "opacity-50"}`}>
      <div className="flex items-center gap-1 sm:gap-2">
        <div className="min-w-0 flex-1 pr-1">{summary}</div>
        <button title="Bearbeiten" onClick={() => setEditing((e) => !e)} className="icon-btn">
          <Pencil size={16} />
        </button>
        <form action={togglePayment}>
          <input type="hidden" name="id" value={values.id} />
          <button title={active ? "Pausieren" : "Aktivieren"} className="icon-btn">
            {active ? <Pause size={16} /> : <Play size={16} />}
          </button>
        </form>
        <UndoDelete
          onDelete={() => deletePaymentUndoable(values.id)}
          onRestore={restorePayment}
          message={`„${values.name}“ gelöscht`}
          label={`${values.name} löschen`}
          className="icon-btn text-bad hover:bg-bad/10 hover:text-bad"
        />
      </div>
      {editing && (
        <div className="animate-fade-down mt-3 rounded-xl bg-surface-2 p-4">
          <PaymentForm accounts={accounts} initial={values} onDone={() => setEditing(false)} />
        </div>
      )}
    </li>
  );
}
