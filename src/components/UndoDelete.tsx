"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import type { ActionState } from "@/actions/types";
import { useToast } from "./Toaster";

/**
 * Löschen mit "Rückgängig" (Ersatz für den Excel-Ablauf "Änderung abbrechen").
 * onDelete liefert die gelöschten Daten, onRestore stellt sie wieder her.
 */
export function UndoDelete<T>({
  onDelete,
  onRestore,
  message,
  label = "Löschen",
  className = "icon-btn text-subtle hover:bg-bad/10 hover:text-bad",
  iconSize = 16,
}: {
  onDelete: () => Promise<T | null>;
  onRestore: (snapshot: T) => Promise<ActionState>;
  message: string;
  label?: string;
  className?: string;
  iconSize?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      title={label}
      aria-label={label}
      className={`${className} disabled:opacity-40`}
      onClick={() =>
        start(async () => {
          const snapshot = await onDelete();
          router.refresh();
          if (!snapshot) return toast({ message: "Schon gelöscht.", tone: "error" });
          toast({
            message,
            actionLabel: "Rückgängig",
            onAction: async () => {
              const res = await onRestore(snapshot);
              router.refresh();
              toast(res?.error ? { message: res.error, tone: "error" } : { message: "Wiederhergestellt" });
            },
          });
        })
      }
    >
      <Trash2 size={iconSize} />
    </button>
  );
}
