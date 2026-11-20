"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff } from "lucide-react";
import { requestPasswordReset, resetPassword } from "@/actions/account";
import { Logo } from "@/components/brand/Logo";
import { LegalLinks } from "@/components/LegalLinks";
import { useChangeKey } from "@/lib/motion";
import { useT } from "@/lib/i18n/client";
import type { ActionState } from "@/actions/types";

function Submit({ label }: { label: string }) {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <button className="btn w-full py-3 text-base" disabled={pending}>
      {pending ? t("Bitte warten …") : label}
    </button>
  );
}

function Messages({ state }: { state: ActionState }) {
  const errorKey = useChangeKey(state);
  if (state?.error) return <p key={errorKey} className="animate-shake rounded-xl bg-bad/10 px-3 py-2 text-sm font-medium text-bad" role="alert">{state.error}</p>;
  if (state?.success) return <p className="animate-fade-down rounded-xl bg-good/10 px-3 py-2 text-sm font-medium text-good" role="status">{state.success}</p>;
  return null;
}

/** Rahmen wie bei Login/Registrierung */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="animate-page w-full max-w-sm">
      <Link href="/" className="mb-8 flex justify-center" aria-label={t("Zur Startseite")}>
        <span className="bloom"><Logo size={40} tagline /></span>
      </Link>
      <div className="card p-6 sm:p-7">
        <h1 className="text-2xl font-black">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        {children}
      </div>
      <p className="mt-5 text-center text-sm text-muted">
        <Link className="font-bold text-accent" href="/login">{t("Zurück zur Anmeldung")}</Link>
      </p>
      <LegalLinks className="mt-4" />
    </div>
  );
}

export function ForgotPasswordForm() {
  const t = useT();
  const [state, action] = useActionState(requestPasswordReset, undefined);
  return (
    <AuthCard title={t("Passwort vergessen?")} subtitle={t("Kein Problem. Gib deine E-Mail-Adresse ein, wir schicken dir einen Link für ein neues Passwort.")}>
      {state?.success ? (
        <div className="mt-6"><Messages state={state} /></div>
      ) : (
        <form action={action} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="email">{t("E-Mail")}</label>
            <input className="input" id="email" name="email" type="email" inputMode="email" autoComplete="email" required />
          </div>
          <Messages state={state} />
          <Submit label={t("Link senden")} />
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useT();
  const [state, action] = useActionState(resetPassword, undefined);
  const [show, setShow] = useState(false);
  return (
    <AuthCard title={t("Neues Passwort festlegen")} subtitle={t("Danach bist du direkt angemeldet. Auf allen anderen Geräten wirst du zur Sicherheit abgemeldet.")}>
      <form action={action} className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="label" htmlFor="password">{t("Neues Passwort")}</label>
          <div className="relative">
            <input className="input pr-11" id="password" name="password" type={show ? "text" : "password"} autoComplete="new-password" minLength={8} required />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:text-fg"
              aria-label={show ? t("Passwort verbergen") : t("Passwort anzeigen")}
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">{t("Mindestens 8 Zeichen.")}</p>
        </div>
        <Messages state={state} />
        <Submit label={t("Passwort speichern")} />
      </form>
    </AuthCard>
  );
}

export function InvalidLink() {
  const t = useT();
  return (
    <AuthCard title={t("Link abgelaufen")} subtitle={t("Der Link ist ungültig oder abgelaufen. Fordere einfach einen neuen an.")}>
      <Link href="/passwort-vergessen" className="btn mt-6 w-full py-3 text-base">{t("Neuen Link anfordern")}</Link>
    </AuthCard>
  );
}
