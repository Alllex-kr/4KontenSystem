import { AnimatedNumber } from "./motion/AnimatedNumber";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  children,
  className = "",
  action,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={`card @container ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="font-bold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={title || action ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

export function Stat({ label, cents, hint, tone = "default", icon }: { label: string; cents: number; hint?: string; tone?: "default" | "good" | "bad"; icon?: React.ReactNode }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-fg";
  return (
    <div className="card">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted sm:text-xs">
        {icon}
        {label}
      </p>
      <p className={`tabular mt-1 text-xl font-black sm:text-2xl ${color}`}>
        <AnimatedNumber cents={cents} />
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function ProgressBar({ value, color }: { value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="bar-grow h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Alert({ tone = "warn", children }: { tone?: "warn" | "info" | "good"; children: React.ReactNode }) {
  const cls =
    tone === "warn"
      ? "border-warn/30 bg-warn/10 text-warn"
      : tone === "good"
        ? "border-good/30 bg-good/10 text-good"
        : "border-accent/30 bg-accent-soft text-accent";
  return <div className={`animate-fade-down rounded-2xl border px-4 py-3 text-sm font-medium ${cls}`}>{children}</div>;
}

export function EmptyState({ icon, title, text, children }: { icon?: React.ReactNode; title: string; text?: string; children?: React.ReactNode }) {
  return (
    <div className="animate-scale-in flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
      {icon && <div className="mb-3 text-subtle">{icon}</div>}
      <p className="font-bold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
