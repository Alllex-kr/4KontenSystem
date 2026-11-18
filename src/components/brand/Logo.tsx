"use client";

import { BRAND } from "@/lib/brand";
import { useT } from "@/lib/i18n/client";
import { LEAF } from "./leaf";

/**
 * Bildmarke: vierblättriges Kleeblatt aus vier Herzen.
 * Blätter im Uhrzeigersinn ab oben links: Fixkosten (blau), Sparen (grün), Notgroschen (orange), Freizeit (lila).
 */
export function LogoMark({ size = 32, mono = false, className = "" }: { size?: number; mono?: boolean; className?: string }) {
  const colors = mono ? ["currentColor", "currentColor", "currentColor", "currentColor"] : BRAND.leaves;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g className="leaves">
        {colors.map((c, i) => (
          // Drehung am <g>, damit das Blatt selbst um seine eigene Mitte animiert werden kann
          <g key={i} transform={`rotate(${i * 90} 32 32)`}>
            <path d={LEAF} fill={c} />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Bildmarke + Wortmarke "vierklee". */
export function Logo({ size = 32, className = "", tagline = false }: { size?: number; className?: string; tagline?: boolean }) {
  const t = useT();
  return (
    <span className={`leaf-spin inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span className="flex flex-col leading-none">
        <span className="font-black tracking-tight" style={{ fontSize: size * 0.72 }} aria-label={BRAND.name}>
          <span className="text-fg">vier</span>
          <span style={{ color: "var(--brand-green)" }}>klee</span>
        </span>
        {tagline && <span className="mt-1 text-[11px] font-semibold text-muted">{t(BRAND.tagline)}</span>}
      </span>
    </span>
  );
}
