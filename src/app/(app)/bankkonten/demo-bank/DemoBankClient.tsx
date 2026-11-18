"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Building2, Check, FlaskConical } from "lucide-react";
import { answerDemoBank } from "@/actions/banking";
import { useT } from "@/lib/i18n/client";

/** Simuliert das Freigabe-Formular einer Bank. Bewusst ohne Passwortfeld: hier werden nie Zugangsdaten eingegeben. */
export function DemoBankClient({ connectionId, accounts }: { connectionId: string; accounts: string[] }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [choice, setChoice] = useState<boolean | null>(null);

  const answer = (approve: boolean) => {
    setChoice(approve);
    start(async () => {
      await answerDemoBank(connectionId, approve);
      router.replace(`/bankkonten/zurueck?c=${connectionId}`);
    });
  };

  return (
    <div className="mx-auto max-w-md py-6">
      <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-xl">
        <div className="flex items-center gap-3 bg-slate-800 px-5 py-4 text-white">
          <Building2 size={24} />
          <div>
            <p className="font-black">{t("Vierklee Demo-Bank")}</p>
            <p className="text-xs opacity-75">{t("Simulation · keine echte Bank")}</p>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <p className="flex items-start gap-2 rounded-xl bg-warn/10 p-3 text-sm text-warn">
            <FlaskConical size={18} className="mt-0.5 shrink-0" />
            {t("Das ist eine Demo. Bei einer echten Bank meldest du dich hier mit deinen Bank-Zugangsdaten an und bestätigst z. B. per pushTAN.")}
          </p>
          <div>
            <p className="font-bold">{t("Vierklee möchte lesend zugreifen auf:")}</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {accounts.map((a) => (
                <li key={a} className="flex items-center gap-2"><Check size={16} className="text-good" /> {a}{t(": Kontostand und Umsätze")}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">{t("Überweisungen sind nicht möglich. Die Freigabe gilt bis zu 180 Tage.")}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button onClick={() => answer(false)} disabled={pending} className="btn-ghost">
              {pending && choice === false ? "…" : t("Abbrechen")}
            </button>
            <button onClick={() => answer(true)} disabled={pending} className="btn">
              {pending && choice ? t("Freigeben …") : t("Zugriff erlauben")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
