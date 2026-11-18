// Sprachen von Vierklee. Deutsch ist die Ausgangssprache: Texte stehen im Code auf Deutsch
// (t("Speichern")), die anderen Sprachen kommen aus src/lib/i18n/messages/<sprache>.ts.

export const LOCALES = ["de", "en", "ru", "tr", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "de";

/** Name jeder Sprache in der Sprache selbst (für den Umschalter). */
export const LOCALE_NAMES: Record<Locale, string> = {
  de: "Deutsch",
  en: "English",
  ru: "Русский",
  tr: "Türkçe",
  es: "Español",
};

export const LOCALE_FLAGS: Record<Locale, string> = { de: "🇩🇪", en: "🇬🇧", ru: "🇷🇺", tr: "🇹🇷", es: "🇪🇸" };

/** Für Zahlen, Beträge und Datumsangaben (Euro bleibt überall die Währung). */
export const INTL_LOCALES: Record<Locale, string> = {
  de: "de-DE",
  en: "en-IE",
  ru: "ru-RU",
  tr: "tr-TR",
  es: "es-ES",
};

export const LOCALE_COOKIE = "vk_lang";

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** Wählt aus dem Accept-Language-Header des Browsers die beste unterstützte Sprache. */
export function matchAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { lang: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q.split("=")[1]) || 0 : 1 };
    })
    .filter((x) => x.lang && x.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { lang } of ranked) if (isLocale(lang)) return lang;
  return null;
}
