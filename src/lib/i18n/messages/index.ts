import type { Locale } from "../config";
import type { Messages } from "../translate";
import en from "./en";
import es from "./es";
import ru from "./ru";
import tr from "./tr";

/** Deutsch braucht kein Wörterbuch: die Schlüssel sind der deutsche Text. */
export const MESSAGES: Record<Locale, Messages> = { de: {}, en, ru, tr, es };
