"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Download, Trash2 } from "lucide-react";
import { deleteAccount } from "@/actions/account";
import { useChangeKey } from "@/lib/motion";
import { useT } from "@/lib/i18n/client";

function DeleteButton() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <button className="btn bg-bad text-white hover:bg-bad/90" disabled={pending}>
      <Trash2 size={16} /> {pending ? t("Bitte warten …") : t("Konto endgültig löschen")}
    </button>
  );
}

/** Konto: E-Mail, Datenexport und Löschen (DSGVO). */
export function AccountSection({ email, verified, hasPassword }: { email: string; verified: boolean; hasPassword: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(deleteAccount, undefined);
  const errorKey = useChangeKey(state);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">{t("E-Mail")}</p>
          <p className="truncate font-semibold">{email}</p>
          <p className={`text-xs font-semibold ${verified ? "text-good" : "text-muted"}`}>{verified ? t("Bestätigt") : t("Noch nicht bestätigt")}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <p className="max-w-md text-sm text-muted">{t("Lade alle deine Daten als Datei herunter (JSON), z. B. als Sicherung oder für einen Wechsel.")}</p>
        {/* Normaler Link statt Prefetch: Der Browser lädt die Datei herunter */}
        <a href="/api/konto/export" className="btn-ghost" download>
          <Download size={16} /> {t("Daten exportieren")}
        </a>
      </div>

      <div className="border-t border-line pt-5">
        {!open ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-sm text-muted">{t("Löscht dein Konto mit allen Konten, Buchungen, Zielen und Einstellungen. Das lässt sich nicht rückgängig machen.")}</p>
            <button type="button" onClick={() => setOpen(true)} className="btn-ghost text-bad">
              <Trash2 size={16} /> {t("Konto löschen")}
            </button>
          </div>
        ) : (
          <form action={action} className="space-y-4 rounded-2xl border border-bad/40 bg-bad/5 p-4">
            <p className="text-sm font-semibold text-bad">
              {t("Dein Konto und alle Daten werden sofort und endgültig gelöscht. Lade sie vorher herunter, wenn du sie behalten möchtest.")}
            </p>
            {hasPassword ? (
              <div>
                <label className="label" htmlFor="delete-password">{t("Zur Bestätigung: dein Passwort")}</label>
                <input id="delete-password" name="password" type="password" className="input" autoComplete="current-password" required />
              </div>
            ) : (
              <div>
                <label className="label" htmlFor="delete-email">{t("Zur Bestätigung: deine E-Mail-Adresse")}</label>
                <input id="delete-email" name="email" type="email" className="input" placeholder={email} autoComplete="off" required />
              </div>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="confirm" className="mt-1" required />
              <span>{t("Ja, ich möchte mein Konto mit allen Daten endgültig löschen.")}</span>
            </label>
            {state?.error && <p key={errorKey} className="animate-shake rounded-xl bg-bad/10 px-3 py-2 text-sm font-medium text-bad" role="alert">{state.error}</p>}
            <div className="flex flex-wrap gap-2">
              <DeleteButton />
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost">{t("Abbrechen")}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
