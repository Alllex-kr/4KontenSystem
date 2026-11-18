"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff } from "lucide-react";
import { login, register } from "@/actions/auth";
import { Logo } from "@/components/brand/Logo";
import { useChangeKey } from "@/lib/motion";
import { GoogleButton } from "./GoogleButton";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn w-full py-3 text-base" disabled={pending}>
      {pending ? "Bitte warten …" : label}
    </button>
  );
}

export function AuthForm({ mode, google = false, notice }: { mode: "login" | "register"; google?: boolean; notice?: string }) {
  const [state, action] = useActionState(mode === "login" ? login : register, undefined);
  const [show, setShow] = useState(false);
  const errorKey = useChangeKey(state);
  const isLogin = mode === "login";

  return (
    <div className="animate-page w-full max-w-sm">
      <Link href="/" className="mb-8 flex justify-center" aria-label="Zur Startseite">
        <span className="bloom"><Logo size={40} tagline /></span>
      </Link>
      <div className="card p-6 sm:p-7">
        <h1 className="text-2xl font-black">{isLogin ? "Willkommen zurück 👋" : "Konto erstellen"}</h1>
        <p className="mt-1 text-sm text-muted">
          {isLogin ? "Schön, dass du da bist. Melde dich an." : "In zwei Minuten startklar, ganz ohne Bankzugang."}
        </p>
        {notice && (
          <p className="animate-fade-down mt-4 rounded-xl bg-bad/10 px-3 py-2 text-sm font-medium text-bad" role="alert">
            {notice}
          </p>
        )}
        {google && (
          <>
            <div className="mt-6">
              <GoogleButton label={isLogin ? "Mit Google anmelden" : "Mit Google registrieren"} />
              {!isLogin && <p className="mt-2 text-center text-xs text-muted">Ein Klick, kein Passwort nötig.</p>}
            </div>
            <div className="mt-5 flex items-center gap-3 text-xs font-semibold text-subtle" aria-hidden>
              <span className="h-px flex-1 bg-line" /> oder mit E-Mail <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}
        <form action={action} className={google ? "mt-5 space-y-4" : "mt-6 space-y-4"}>
          {!isLogin && (
            <div>
              <label className="label" htmlFor="name">Wie heißt du?</label>
              <input className="input" id="name" name="name" autoComplete="given-name" required />
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">E-Mail</label>
            <input className="input" id="email" name="email" type="email" inputMode="email" autoComplete="email" required />
          </div>
          <div>
            <label className="label" htmlFor="password">Passwort</label>
            <div className="relative">
              <input
                className="input pr-11"
                id="password"
                name="password"
                type={show ? "text" : "password"}
                autoComplete={isLogin ? "current-password" : "new-password"}
                minLength={isLogin ? undefined : 8}
                required
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:text-fg"
                aria-label={show ? "Passwort verbergen" : "Passwort anzeigen"}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {!isLogin && <p className="mt-1 text-xs text-muted">Mindestens 8 Zeichen.</p>}
          </div>
          {state?.error && <p key={errorKey} className="animate-shake rounded-xl bg-bad/10 px-3 py-2 text-sm font-medium text-bad" role="alert">{state.error}</p>}
          <Submit label={isLogin ? "Anmelden" : "Registrieren"} />
        </form>
      </div>
      <p className="mt-5 text-center text-sm text-muted">
        {isLogin ? "Noch kein Konto? " : "Schon registriert? "}
        <Link className="font-bold text-accent" href={isLogin ? "/register" : "/login"}>
          {isLogin ? "Kostenlos registrieren" : "Anmelden"}
        </Link>
      </p>
    </div>
  );
}
