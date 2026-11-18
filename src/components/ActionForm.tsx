"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/actions/types";
import { useChangeKey } from "@/lib/motion";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Formular für Server Actions mit Fehler-/Erfolgsmeldung. Setzt sich nach Erfolg optional zurück. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = true,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const errorKey = useChangeKey(state);
  useEffect(() => {
    if (state?.success && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state?.error && <p key={errorKey} className="animate-shake mt-2 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad" role="alert">{state.error}</p>}
      {state?.success && <p className="animate-fade-down mt-2 rounded-xl bg-good/10 px-3 py-2 text-sm text-good" role="status">{state.success}</p>}
    </form>
  );
}

export function SubmitButton({ children, className = "btn" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? "Speichern …" : children}
    </button>
  );
}
