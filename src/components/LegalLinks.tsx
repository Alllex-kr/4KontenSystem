"use client";

import Link from "next/link";
import { useLocale, useT } from "@/lib/i18n/client";

/** Links zu Impressum und Datenschutz (Pflicht auf jeder öffentlichen Seite). */
export function LegalLinks({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <nav className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted ${className}`} aria-label={t("Rechtliches")}>
      <Link href="/impressum" className="hover:text-fg hover:underline">{t("Impressum")}</Link>
      <Link href="/datenschutz" className="hover:text-fg hover:underline">{t("Datenschutz")}</Link>
    </nav>
  );
}

/** Hinweis für andere Sprachen: Die Rechtstexte gibt es verbindlich nur auf Deutsch. */
export function GermanOnlyNotice() {
  const t = useT();
  if (useLocale() === "de") return null;
  return (
    <p className="mb-6 rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">
      {t("Diese Seite ist nur auf Deutsch verfügbar. Die deutsche Fassung ist rechtlich verbindlich.")}
    </p>
  );
}
