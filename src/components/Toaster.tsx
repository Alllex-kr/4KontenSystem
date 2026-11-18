"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Check, Undo2, X } from "lucide-react";

type Toast = { id: number; message: string; tone: "default" | "error"; actionLabel?: string; onAction?: () => void | Promise<void>; duration: number };
type ShowToast = (t: { message: string; tone?: Toast["tone"]; actionLabel?: string; onAction?: () => void | Promise<void>; duration?: number }) => void;

const ToastContext = createContext<ShowToast>(() => {});

/** Kleine Meldungen unten am Bildschirm, optional mit Aktion (z. B. "Rückgängig"). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show: ShowToast = useCallback(
    ({ message, tone = "default", actionLabel, onAction, duration = actionLabel ? 6000 : 2800 }) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, message, tone, actionLabel, onAction, duration }]);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-bold shadow-xl ${
              t.tone === "error" ? "bg-bad text-white" : "bg-fg text-bg"
            }`}
          >
            {t.tone !== "error" && !t.actionLabel && <Check size={16} className="shrink-0" />}
            <span className="min-w-0 flex-1">{t.message}</span>
            {t.actionLabel && (
              <button
                onClick={async () => {
                  dismiss(t.id);
                  await t.onAction?.();
                }}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1 text-xs font-black transition hover:bg-white/25"
              >
                <Undo2 size={14} /> {t.actionLabel}
              </button>
            )}
            <button onClick={() => dismiss(t.id)} className="shrink-0 opacity-60 hover:opacity-100" aria-label="Meldung schließen">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
