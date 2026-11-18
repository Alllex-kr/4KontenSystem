import { googleEnabled } from "@/lib/oauth/google";
import { AuthForm } from "../AuthForm";
import { msg } from "@/lib/i18n/translate";
import { getT } from "@/lib/i18n/server";

const GOOGLE_ERRORS: Record<string, string> = {
  "google-aus": msg("Die Anmeldung mit Google ist noch nicht eingerichtet."),
  "google-abgebrochen": msg("Die Anmeldung mit Google wurde abgebrochen."),
  "google-abgelaufen": msg("Die Anmeldung mit Google ist abgelaufen. Bitte versuch es noch einmal."),
  "google-fehler": msg("Bei der Anmeldung mit Google ist etwas schiefgegangen. Bitte versuch es noch einmal."),
  "email-unbestaetigt": msg("Deine E-Mail-Adresse ist bei Google nicht bestätigt. Bestätige sie dort oder registriere dich mit Passwort."),
  gesperrt: msg("Dieses Konto ist gesperrt. Bitte wende dich an den Support."),
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ fehler?: string }> }) {
  const { fehler } = await searchParams;
  const t = await getT();
  return <AuthForm mode="login" google={googleEnabled()} notice={fehler && GOOGLE_ERRORS[fehler] ? t(GOOGLE_ERRORS[fehler]) : undefined} />;
}
