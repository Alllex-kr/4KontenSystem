import Link from "next/link";
import { Lock } from "lucide-react";
import { PERMISSIONS, type PermissionKey } from "@/lib/access/catalog";
import { PageHeader } from "./ui";

/** Anzeige statt einer Seite, deren Funktion im Abo des Nutzers nicht enthalten ist. */
export function FeatureLocked({ feature, planName }: { feature: PermissionKey; planName?: string }) {
  const def = PERMISSIONS[feature];
  return (
    <div className="max-w-2xl">
      <PageHeader title={def.label} />
      <div className="animate-scale-in flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Lock size={26} />
        </span>
        <p className="text-lg font-black">In deinem Abo{planName ? ` „${planName}“` : ""} nicht enthalten</p>
        <p className="mt-1 max-w-sm text-sm text-muted">{def.description}</p>
        <Link href="/dashboard" className="btn-ghost mt-5">Zurück zum Dashboard</Link>
      </div>
    </div>
  );
}
