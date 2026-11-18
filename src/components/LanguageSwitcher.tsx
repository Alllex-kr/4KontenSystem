"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Languages } from "lucide-react";
import { setLanguage } from "@/actions/language";
import { LOCALES, LOCALE_FLAGS, LOCALE_NAMES } from "@/lib/i18n/config";
import { useLocale, useT } from "@/lib/i18n/client";

/**
 * Sprachauswahl. saved = gespeicherte Wahl ("auto" = Browsersprache).
 * Ohne saved (z. B. nicht angemeldet) zeigt sie die aktuelle Sprache und bietet "Automatisch" nicht an.
 */
export function LanguageSwitcher({ saved, className = "", compact = false }: { saved?: string | null; className?: string; compact?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const value = saved === undefined ? locale : (saved ?? "auto");

  return (
    <label className={`relative flex items-center ${className}`}>
      <span className="sr-only">{t("Sprache")}</span>
      <Languages size={compact ? 15 : 17} className="pointer-events-none absolute left-3 text-muted" aria-hidden />
      <select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          start(async () => {
            await setLanguage(next);
            router.refresh();
          });
        }}
        className={`input appearance-none pr-8 pl-9 ${compact ? "min-h-9 py-1 text-xs font-semibold sm:min-h-9" : ""} ${pending ? "opacity-60" : ""}`}
        aria-label={t("Sprache")}
      >
        {saved !== undefined && <option value="auto">{t("Automatisch (Browser)")}</option>}
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_FLAGS[l]} {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-3 text-xs text-muted">▾</span>
    </label>
  );
}
