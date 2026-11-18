import { msg } from "./i18n/translate";

/** Zentrale Markenangaben. Hier ändern, wenn die Marke umbenannt wird. */
export const BRAND = {
  name: "Vierklee",
  tagline: msg("Glück ist planbar."),
  claim: msg("Das Vier-Konten-System für dein Studium"),
  description: msg(
    "Vierklee teilt dein Geld auf vier Konten auf: Fixkosten, Sparen, Notgroschen und Freizeit. So weißt du immer, was du ausgeben darfst, ohne Excel und ohne Stress.",
  ),
  /** Primärfarbe der Marke (Klee-Grün) */
  primary: "#15803d",
  /** Farben der vier Blätter: Fixkosten, Sparen, Notgroschen, Freizeit */
  leaves: ["#3b82f6", "#10b981", "#f59e0b", "#a855f7"],
} as const;
