"use client";

import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LOCALE, type Locale } from "./config";
import { setCurrentLocale } from "./current";
import { makeT, type Messages, type T } from "./translate";

const I18nContext = createContext<{ locale: Locale; t: T }>({ locale: DEFAULT_LOCALE, t: makeT({}) });

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: React.ReactNode }) {
  // Für formatCents/formatDate im Browser (vor dem ersten Render der Kinder)
  setCurrentLocale(locale);
  const value = useMemo(() => ({ locale, t: makeT(messages) }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Übersetzungsfunktion für Client-Komponenten. */
export const useT = () => useContext(I18nContext).t;
export const useLocale = () => useContext(I18nContext).locale;
