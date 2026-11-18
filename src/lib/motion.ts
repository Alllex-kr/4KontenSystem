"use client";

import { useEffect, useRef, useState } from "react";

/** Kleine Helfer für Animationen im Browser. */

/** Zähler, der sich nur ändert, wenn sich value ändert. Als key genutzt, startet er eine Animation neu (z. B. Fehler-Schütteln). */
export function useChangeKey(value: unknown): number {
  const [key, setKey] = useState(0);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setKey((k) => k + 1);
    }
  }, [value]);
  return key;
}

/** Eigene Einstellung (Design & Anpassen) hat Vorrang, sonst gilt "Bewegung reduzieren" des Geräts. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  const pref = document.documentElement.dataset.motion;
  if (pref === "on") return false;
  if (pref === "off") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function deviceReducesMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Nach dem ersten Laden (Hydration) gesetzt. Komponenten, die danach erscheinen
// (Navigation innerhalb der App), dürfen von 0 hochzählen, ohne dass es flackert.
let hydrated = false;
export function markHydrated() {
  hydrated = true;
}
export function isHydrated() {
  return hydrated;
}

/**
 * Wechselt das Theme mit einem Kreis, der sich vom angeklickten Punkt ausbreitet.
 * Fallback ohne View-Transition-Unterstützung: weicher Farbübergang.
 */
export function themeTransition(change: () => void, origin?: { x: number; y: number }) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  if (!doc.startViewTransition || prefersReducedMotion()) {
    softColorTransition(change);
    return;
  }
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? 0;
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const t = doc.startViewTransition(change);
  t.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 550, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    })
    .catch(() => {});
}

/** Für ~400 ms alle Farben weich überblenden (z. B. beim Wechsel der Akzentfarbe). */
export function softColorTransition(change: () => void) {
  const el = document.documentElement;
  if (prefersReducedMotion()) return change();
  el.classList.add("appearance-anim");
  change();
  window.setTimeout(() => el.classList.remove("appearance-anim"), 420);
}

export function centerOf(e: { currentTarget: EventTarget | null }) {
  const el = e.currentTarget as HTMLElement | null;
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
