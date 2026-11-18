"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2, XCircle } from "lucide-react";
import { finalizeBankConnection, syncBankConnection } from "@/actions/banking";
import { LogoMark } from "@/components/brand/Logo";
import { SuccessBurst } from "@/components/motion/SuccessBurst";

/** Nach dem Web-Formular: Status abfragen (bis zu 2 Minuten), dann zurück zur Übersicht. */
export function ReturnClient({ connectionId, afterSync }: { connectionId: string; afterSync: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"working" | "done" | "failed">("working");
  const [message, setMessage] = useState(afterSync ? "Hole neue Umsätze von deiner Bank …" : "Prüfe die Freigabe bei deiner Bank …");
  const started = useRef(false);
  const mounted = useRef(true);

  // Im Dev-Modus (React Strict Mode) laufen Effekte doppelt. Deshalb: genau ein Durchlauf (started),
  // und vor jedem State-Update prüfen, ob die Seite noch angezeigt wird (mounted).
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (started.current || !connectionId) return;
    started.current = true;

    (async () => {
      if (afterSync) {
        const res = await syncBankConnection(connectionId);
        if (!mounted.current) return;
        if (res.redirectUrl) return window.location.assign(res.redirectUrl);
        if (res.error) {
          setState("failed");
          setMessage(res.error);
          return;
        }
        setState("done");
        setMessage(res.message ?? "Synchronisiert.");
        setTimeout(() => router.replace("/bankkonten"), 1500);
        return;
      }
      for (let i = 0; i < 60; i++) {
        const res = await finalizeBankConnection(connectionId);
        if (!mounted.current) return;
        if (res.status === "completed") {
          setState("done");
          setMessage("Verbunden! Ordne jetzt deine Konten zu.");
          setTimeout(() => router.replace("/bankkonten?neu=1"), 1200);
          return;
        }
        if (res.status === "failed") {
          setState("failed");
          setMessage(res.error ?? "Die Verbindung hat nicht geklappt.");
          return;
        }
        if (res.message) setMessage(res.message);
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (mounted.current) {
        setState("failed");
        setMessage("Die Bank hat nicht rechtzeitig geantwortet. Du kannst den Status später unter „Bankkonten“ prüfen.");
      }
    })();
  }, [connectionId, afterSync, router]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center" role="status" aria-live="polite">
      {state === "working" && (
        <div className="relative">
          <LogoMark size={72} className="animate-[spin_3s_linear_infinite]" />
          <Loader2 className="absolute -bottom-2 -right-2 animate-spin text-accent" size={24} />
        </div>
      )}
      {state === "done" && <SuccessBurst size={64} />}
      {state === "failed" && <XCircle size={64} className="animate-shake text-bad" />}
      <h1 className="mt-6 text-2xl font-black">{state === "working" ? "Einen Moment …" : state === "done" ? "Geschafft! 🍀" : "Das hat nicht geklappt"}</h1>
      <p className="mt-2 text-muted">{message}</p>
      {state !== "working" && (
        <Link href="/bankkonten" className="btn mt-6">Zu den Bankkonten</Link>
      )}
    </div>
  );
}
