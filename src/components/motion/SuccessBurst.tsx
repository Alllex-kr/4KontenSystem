import { BRAND } from "@/lib/brand";

import { LEAF } from "@/components/brand/leaf";

/** Erfolgs-Moment: Haken, der sich zeichnet, und kleine Kleeblätter, die herausfliegen. */
export function SuccessBurst({ size = 64, className = "" }: { size?: number; className?: string }) {
  const leaves = Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2;
    const dist = size * (0.9 + (i % 3) * 0.25);
    return {
      bx: `${Math.round(Math.cos(angle) * dist)}px`,
      by: `${Math.round(Math.sin(angle) * dist)}px`,
      br: `${(i % 2 ? 1 : -1) * (90 + i * 25)}deg`,
      color: BRAND.leaves[i % 4],
      delay: `${(i % 4) * 30}ms`,
    };
  });
  return (
    <span className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }} aria-hidden>
      {leaves.map((l, i) => (
        <svg
          key={i}
          viewBox="0 0 34 34"
          width={size * 0.22}
          height={size * 0.22}
          className="burst-leaf absolute"
          style={{ ["--bx" as string]: l.bx, ["--by" as string]: l.by, ["--br" as string]: l.br, animation: `burst 800ms cubic-bezier(0.16,1,0.3,1) ${l.delay} both` }}
        >
          <path d={LEAF} fill={l.color} />
        </svg>
      ))}
      <svg viewBox="0 0 52 52" width={size} height={size} className="animate-pop relative">
        <circle cx="26" cy="26" r="25" fill="var(--good)" opacity="0.15" />
        <circle cx="26" cy="26" r="20" fill="var(--good)" />
        <path
          d="M16 27l7 7 13-15"
          fill="none"
          stroke="white"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="40"
          strokeDashoffset="40"
          style={{ animation: "draw 420ms cubic-bezier(0.65,0,0.35,1) 220ms forwards" }}
        />
      </svg>
    </span>
  );
}
