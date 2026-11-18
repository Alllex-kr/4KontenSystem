"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatCents } from "@/lib/format";
import { isHydrated, prefersReducedMotion } from "@/lib/motion";

const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

/**
 * Geldbetrag, der weich zum neuen Wert zählt.
 * - Erster Render ist immer der echte Wert (identisch mit dem Server → keine Hydration-Fehler).
 * - Nach einem Seitenwechsel innerhalb der App zählt er von 0 hoch (Start vor dem ersten Zeichnen, also ohne Flackern).
 * - Ändert sich der Wert (z. B. nach einer Buchung), zählt er vom alten zum neuen Wert.
 */
export function AnimatedNumber({ cents, duration = 900, className }: { cents: number; duration?: number; className?: string }) {
  const [shown, setShown] = useState(cents);
  const current = useRef(cents);
  const frame = useRef<number | null>(null);
  const mountedAfterNavigation = useRef(isHydrated());

  const animate = (from: number, to: number) => {
    if (frame.current) cancelAnimationFrame(frame.current);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = Math.round(from + (to - from) * easeOut(t));
      current.current = v;
      setShown(v);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  // Erstes Erscheinen nach Navigation: vor dem Zeichnen auf 0 setzen und hochzählen
  useLayoutEffect(() => {
    if (mountedAfterNavigation.current && !prefersReducedMotion() && cents !== 0) {
      current.current = 0;
      setShown(0);
      animate(0, cents);
    }
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
    // nur beim ersten Erscheinen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Spätere Wertänderungen
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (prefersReducedMotion() || current.current === cents) {
      current.current = cents;
      setShown(cents);
      return;
    }
    animate(current.current, cents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents]);

  return (
    <span className={className} aria-label={formatCents(cents)}>
      <span aria-hidden>{formatCents(shown)}</span>
    </span>
  );
}
