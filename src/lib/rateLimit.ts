// Einfache Begrenzung von Versuchen (z. B. Login), damit niemand massenhaft Passwörter durchprobieren kann.
// Die Zähler liegen im Arbeitsspeicher. Das reicht für einen einzelnen Server-Prozess;
// nach einem Neustart beginnen die Zähler von vorn.

type Bucket = { count: number; resetAt: number };

export type Limit = { max: number; windowMs: number };

export type RateLimiter = {
  /** Ist der Schlüssel gerade gesperrt? Gibt dann die Wartezeit in ms zurück, sonst 0. */
  blockedFor(key: string, limit: Limit): number;
  /** Zählt einen Versuch. */
  hit(key: string, limit: Limit): void;
  /** Setzt einen Schlüssel zurück (z. B. nach erfolgreichem Login). */
  reset(key: string): void;
};

export function createRateLimiter(now: () => number = Date.now): RateLimiter {
  const buckets = new Map<string, Bucket>();
  let lastSweep = now();

  function sweep() {
    const t = now();
    if (t - lastSweep < 60_000) return;
    lastSweep = t;
    for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
  }

  function current(key: string) {
    const b = buckets.get(key);
    if (b && b.resetAt <= now()) {
      buckets.delete(key);
      return undefined;
    }
    return b;
  }

  return {
    blockedFor(key, limit) {
      sweep();
      const b = current(key);
      return b && b.count >= limit.max ? b.resetAt - now() : 0;
    },
    hit(key, limit) {
      const b = current(key);
      if (b) b.count++;
      else buckets.set(key, { count: 1, resetAt: now() + limit.windowMs });
    },
    reset(key) {
      buckets.delete(key);
    },
  };
}

const MIN = 60_000;

export const LIMITS = {
  /** Fehlversuche pro E-Mail-Adresse */
  loginPerEmail: { max: 5, windowMs: 15 * MIN },
  /** Login-Versuche pro IP-Adresse (alle Konten zusammen) */
  loginPerIp: { max: 30, windowMs: 15 * MIN },
  /** Neue Konten pro IP-Adresse */
  registerPerIp: { max: 5, windowMs: 60 * MIN },
  /** "Passwort vergessen"-Anfragen pro IP und pro E-Mail (schützt auch vor E-Mail-Spam an fremde Adressen) */
  resetPerIp: { max: 5, windowMs: 60 * MIN },
  resetPerEmail: { max: 3, windowMs: 60 * MIN },
  /** Bestätigungs-E-Mail erneut senden, pro Konto */
  verifyResendPerUser: { max: 3, windowMs: 60 * MIN },
  /** Passwortprüfung beim Löschen des Kontos */
  deletePerUser: { max: 5, windowMs: 15 * MIN },
} satisfies Record<string, Limit>;

// Ein Zähler für den ganzen Prozess, auch wenn Next.js das Modul im Dev-Modus neu lädt.
const g = globalThis as unknown as { __finanzkleeRateLimiter?: RateLimiter };
export const rateLimiter = (g.__finanzkleeRateLimiter ??= createRateLimiter());

/** Wartezeit in ganzen Minuten (mindestens 1) für die Fehlermeldung. */
export const waitMinutes = (ms: number) => Math.max(1, Math.ceil(ms / MIN));

/**
 * IP-Adresse des Besuchers. Hinter einem Reverse Proxy (Caddy, nginx) steht sie in X-Forwarded-For.
 * Wir nehmen den letzten Eintrag: Den hat unser eigener Proxy angehängt, die davor kann der Besucher fälschen.
 * Wichtig: Die App selbst darf dann nur über den Proxy erreichbar sein (Port nur auf 127.0.0.1).
 */
export function clientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").map((s) => s.trim()).filter(Boolean).pop();
  return last || headers.get("x-real-ip") || "unbekannt";
}
