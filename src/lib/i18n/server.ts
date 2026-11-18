import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getCurrentUser } from "../auth";
import { prisma } from "../db";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, matchAcceptLanguage, type Locale } from "./config";
import { setCurrentLocale } from "./current";
import { MESSAGES } from "./messages";
import { makeT, type T } from "./translate";

/**
 * Sprache dieser Anfrage:
 * 1. gespeicherte Wahl im Konto, 2. Cookie (Wahl ohne Login), 3. Browsersprache, 4. Deutsch.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  let locale: Locale = DEFAULT_LOCALE;
  const user = await getCurrentUser();
  const saved = user ? (await prisma.settings.findUnique({ where: { userId: user.id }, select: { language: true } }))?.language : null;
  if (isLocale(saved)) locale = saved;
  else {
    const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
    if (isLocale(cookie)) locale = cookie;
    else locale = matchAcceptLanguage((await headers()).get("accept-language")) ?? DEFAULT_LOCALE;
  }
  setCurrentLocale(locale);
  return locale;
});

/** Übersetzungsfunktion für Server-Komponenten und Server Actions. */
export async function getT(): Promise<T> {
  return makeT(MESSAGES[await getLocale()]);
}
