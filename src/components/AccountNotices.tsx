"use client";

import { Suspense, useActionState, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import { MailCheck } from "lucide-react";
import { resendVerification } from "@/actions/account";
import { useToast } from "./Toaster";
import { useT } from "@/lib/i18n/client";

/** Hinweise rund ums Konto: E-Mail noch nicht bestätigt, Meldungen nach Links aus E-Mails. */
export function AccountNotices({ unverifiedEmail }: { unverifiedEmail: string | null }) {
  return (
    <>
      {unverifiedEmail && <VerifyBanner email={unverifiedEmail} />}
      <Suspense fallback={null}>
        <QueryToasts />
      </Suspense>
    </>
  );
}

function ResendButton() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <button className="btn-ghost shrink-0 text-sm" disabled={pending}>
      {pending ? t("Bitte warten …") : t("Erneut senden")}
    </button>
  );
}

function VerifyBanner({ email }: { email: string }) {
  const t = useT();
  const [state, action] = useActionState(resendVerification, undefined);
  return (
    <div className="animate-fade-down mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm" role="status">
      <MailCheck size={20} className="shrink-0 text-accent" />
      <p className="min-w-0 flex-1">
        {state?.success ?? state?.error ?? t("Bitte bestätige deine E-Mail-Adresse {email}. Den Link findest du in deinem Postfach.", { email })}
      </p>
      {!state?.success && (
        <form action={action}>
          <ResendButton />
        </form>
      )}
    </div>
  );
}

function QueryToasts() {
  const t = useT();
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const shown = useRef("");

  useEffect(() => {
    const confirmed = params.get("bestaetigt");
    const password = params.get("passwort");
    if (!confirmed && !password) return;
    // Jede Meldung nur einmal zeigen (Effekte können mehrfach laufen, bis die Adresse bereinigt ist)
    const key = `${confirmed}|${password}`;
    if (shown.current === key) return;
    shown.current = key;
    if (confirmed === "1") toast({ message: t("Danke! Deine E-Mail-Adresse ist bestätigt.") });
    if (confirmed === "fehler") toast({ message: t("Der Link ist ungültig oder abgelaufen. Fordere einfach einen neuen an."), tone: "error", duration: 6000 });
    if (password === "neu") toast({ message: t("Dein neues Passwort ist gespeichert.") });
    // Parameter aus der Adresse entfernen, damit die Meldung beim Neuladen nicht wiederkommt
    const rest = new URLSearchParams(params);
    rest.delete("bestaetigt");
    rest.delete("passwort");
    router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false });
  }, [params, pathname, router, t, toast]);

  return null;
}
