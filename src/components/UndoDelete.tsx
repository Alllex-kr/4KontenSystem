"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import type { ActionState } from "@/actions/types";
import { useToast } from "./Toaster";
import { useT } from "@/lib/i18n/client";

/**
 * Löschen mit "Rückgängig" (Ersatz für den Excel-Ablauf "Änderung abbrechen").
 * onDelete liefert die gelöschten Daten, onRestore stellt sie wieder her.
 */
export function UndoDelete<T>({
  onDelete,
  onRestore,
  message,
  label,
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
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      title={label ?? t("Löschen")}
      aria-label={label ?? t("Löschen")}
      className={`${className} disabled:opacity-40`}
      onClick={() =>
        start(async () => {
          const snapshot = await onDelete();
          router.refresh();
          if (!snapshot) return toast({ message: t("Schon gelöscht."), tone: "error" });
          toast({
            message,
            actionLabel: t("Rückgängig"),
            onAction: async () => {
              const res = await onRestore(snapshot);
              router.refresh();
              toast(res?.error ? { message: res.error, tone: "error" } : { message: t("Wiederhergestellt") });
            },
          });
        })
      }
    >
      <Trash2 size={iconSize} />
    </button>
  );
}
