// Aktuelle Sprache für Formatierungen (Beträge, Datum), ohne sie überall durchreichen zu müssen.
// - Browser: vom I18nProvider gesetzt (ein Nutzer pro Fenster).
// - Server, Server-Komponenten: pro Anfrage über React.cache (gesetzt von getLocale()).
// - Server, Vorab-Rendern der Client-Komponenten (SSR): React.cache wirkt dort nicht. Deshalb
//   zusätzlich AsyncLocalStorage pro Anfrage, sonst würden Server und Browser Beträge
//   unterschiedlich formatieren (Hydration-Fehler) oder sich gleichzeitige Anfragen stören.
import { cache } from "react";
import { DEFAULT_LOCALE, type Locale } from "./config";

type Store = { locale: Locale };
type Als = { getStore(): Store | undefined; enterWith(store: Store): void };

const requestStore = cache((): Store => ({ locale: DEFAULT_LOCALE }));

/** Eine Instanz pro Prozess (auch über Hot Reload hinweg). Next.js stellt AsyncLocalStorage global bereit. */
function als(): Als | null {
  if (typeof window !== "undefined") return null;
  const g = globalThis as unknown as { AsyncLocalStorage?: new () => Als; __vkLocaleAls?: Als };
  if (!g.__vkLocaleAls && g.AsyncLocalStorage) g.__vkLocaleAls = new g.AsyncLocalStorage();
  return g.__vkLocaleAls ?? null;
}

let browserLocale: Locale | null = null;

export function setCurrentLocale(locale: Locale) {
  if (typeof window !== "undefined") {
    browserLocale = locale;
    return;
  }
  try {
    requestStore().locale = locale;
  } catch {
    // außerhalb einer Anfrage
  }
  const store = als();
  if (store && store.getStore()?.locale !== locale) store.enterWith({ locale });
}

export function currentLocale(): Locale {
  if (typeof window !== "undefined") return browserLocale ?? DEFAULT_LOCALE;
  const fromAls = als()?.getStore()?.locale;
  if (fromAls) return fromAls;
  try {
    return requestStore().locale;
  } catch {
    return DEFAULT_LOCALE;
  }
}
