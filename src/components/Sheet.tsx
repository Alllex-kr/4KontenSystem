"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * Bottom-Sheet auf dem Handy, zentrierter Dialog ab Tablet-Breite.
 * Mit Ein- und Ausblend-Animation; auf dem Handy lässt es sich nach unten wegwischen.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);

  // Beim Schließen erst ausblenden, dann entfernen
  useEffect(() => {
    if (open) {
      setRendered(true);
      setLeaving(false);
      setDrag(0);
    } else if (rendered) {
      if (prefersReducedMotion()) {
        setRendered(false);
        return;
      }
      setLeaving(true);
      const t = setTimeout(() => {
        setRendered(false);
        setLeaving(false);
      }, 230);
      return () => clearTimeout(t);
    }
  }, [open, rendered]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>("[data-autofocus], input, button")?.focus(), 60);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!rendered) return null;

  // Wischen am Griff: ab 90 px nach unten schließen
  const onPointerDown = (e: React.PointerEvent) => {
    dragStart.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStart.current !== null) setDrag(Math.max(0, e.clientY - dragStart.current));
  };
  const onPointerUp = () => {
    if (drag > 90) onClose();
    else setDrag(0);
    dragStart.current = null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`absolute inset-0 bg-black/40 backdrop-blur-[2px] ${leaving ? "animate-fade-out" : "animate-fade"}`} onClick={onClose} />
      <div
        ref={panel}
        className={`relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-line bg-surface px-4 pt-2 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:px-6 sm:pt-5 ${leaving ? "animate-sheet-out" : "animate-sheet"}`}
        style={{
          paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
          translate: drag ? `0 ${drag}px` : undefined,
          transition: dragStart.current === null ? "translate 250ms var(--ease-out)" : "none",
        }}
      >
        <div
          className="-mx-4 mb-2 flex cursor-grab touch-none justify-center py-2 sm:hidden"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-hidden
        >
          <div className="h-1.5 w-10 rounded-full bg-line-strong" />
        </div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black">{title}</h2>
          <button onClick={onClose} className="icon-btn" aria-label="Schließen">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
