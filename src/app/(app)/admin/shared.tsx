import Link from "next/link";
import { permissionsByCategory, type PermissionKey } from "@/lib/access/catalog";

export const ONLINE_MS = 5 * 60_000;

export function relativeTime(d: Date | null) {
  if (!d) return "nie";
  const diff = Date.now() - d.getTime();
  if (diff < ONLINE_MS) return "gerade aktiv";
  const min = Math.round(diff / 60_000);
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const days = Math.round(h / 24);
  if (days < 30) return `vor ${days} ${days === 1 ? "Tag" : "Tagen"}`;
  return d.toLocaleDateString("de-DE");
}

export function Badge({ tone = "default", children, title }: { tone?: "default" | "good" | "bad" | "accent" | "warn"; children: React.ReactNode; title?: string }) {
  const cls = {
    default: "bg-surface-2 text-muted",
    good: "bg-good/10 text-good",
    bad: "bg-bad/10 text-bad",
    warn: "bg-warn/10 text-warn",
    accent: "bg-accent-soft text-accent",
  }[tone];
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>
      {children}
    </span>
  );
}

export function OnlineDot({ online }: { online: boolean }) {
  return <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${online ? "bg-good" : "bg-line-strong"}`} />;
}

/** Checkboxen aller Berechtigungen aus dem Katalog, nach Kategorie. */
export function PermissionChecklist({ selected, disabled }: { selected: Set<string>; disabled?: boolean }) {
  return (
    <div className="space-y-4">
      {permissionsByCategory().map(([category, items]) => (
        <fieldset key={category}>
          <legend className="label">{category}</legend>
          <div className="space-y-2">
            {items.map(({ key, def }) => (
              <label key={key} className="flex items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft/50">
                <input type="checkbox" name="perm" value={key} defaultChecked={selected.has(key)} disabled={disabled} className="mt-0.5 h-5 w-5 accent-[var(--accent)]" />
                <span className="min-w-0 text-sm">
                  <span className="block font-bold">{def.label}</span>
                  <span className="block text-muted">{def.description}</span>
                  <code className="text-[11px] text-subtle">{key}</code>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

/** Auswahl von Berechtigungssätzen (Name des Formularfelds: "set"). */
export function SetChecklist({
  sets,
  selected,
}: {
  sets: { id: string; name: string; permissions: { permissionKey: string }[] }[];
  selected: Set<string>;
}) {
  if (!sets.length) return <p className="text-sm text-muted">Noch keine Berechtigungssätze.</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {sets.map((s) => (
        <label key={s.id} className="flex items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft/50">
          <input type="checkbox" name="set" value={s.id} defaultChecked={selected.has(s.id)} className="mt-0.5 h-5 w-5 accent-[var(--accent)]" />
          <span className="min-w-0 text-sm">
            <span className="block font-bold">{s.name}</span>
            <span className="block text-xs text-muted">{s.permissions.length} {s.permissions.length === 1 ? "Berechtigung" : "Berechtigungen"}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

/** Auswahl von Satzgruppen (Name des Formularfelds: "setGroup"). */
export function SetGroupChecklist({
  setGroups,
  selected,
}: {
  setGroups: { id: string; name: string; sets: { set: { name: string } }[] }[];
  selected: Set<string>;
}) {
  if (!setGroups.length) return <p className="text-sm text-muted">Noch keine Satzgruppen.</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {setGroups.map((g) => (
        <label key={g.id} className="flex items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft/50">
          <input type="checkbox" name="setGroup" value={g.id} defaultChecked={selected.has(g.id)} className="mt-0.5 h-5 w-5 accent-[var(--accent)]" />
          <span className="min-w-0 text-sm">
            <span className="block font-bold">{g.name}</span>
            <span className="block text-xs text-muted">{g.sets.map((s) => s.set.name).join(", ") || "leer"}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

/** Einzelne Sätze, eingeklappt: für Sonderfälle neben den Satzgruppen. */
export function ExtraSets({ sets, selected }: { sets: { id: string; name: string; permissions: { permissionKey: string }[] }[]; selected: Set<string> }) {
  return (
    <details className="group rounded-xl border border-line p-3" open={selected.size > 0}>
      <summary className="cursor-pointer text-sm font-bold">
        Einzelne Berechtigungssätze zusätzlich {selected.size > 0 && <span className="text-accent">({selected.size})</span>}
      </summary>
      <p className="mt-1 mb-3 text-xs text-muted">Nur für Ausnahmen. Normalerweise reichen Satzgruppen.</p>
      <SetChecklist sets={sets} selected={selected} />
    </details>
  );
}

export function UsedBy({ label, items }: { label: string; items: { key: string; label: string; href: string }[] }) {
  return (
    <div>
      <p className="label">{label}</p>
      {items.length === 0 ? (
        <p className="text-muted">–</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((i) => (
            <Link key={i.key} href={i.href} className="chip min-h-8 text-xs">
              {i.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export type { PermissionKey };
