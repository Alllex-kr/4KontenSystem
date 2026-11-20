import { googleEnabled } from "@/lib/oauth/google";
import { AuthForm } from "../AuthForm";
import { msg } from "@/lib/i18n/translate";
import { getT } from "@/lib/i18n/server";

const ERRORS: Record<string, string> = {
  "google-aus": msg("Die Anmeldung mit Google ist noch nicht eingerichtet."),
  "google-abgebrochen": msg("Die Anmeldung mit Google wurde abgebrochen."),
  "google-abgelaufen": msg("Die Anmeldung mit Google ist abgelaufen. Bitte versuch es noch einmal."),
  "google-fehler": msg("Bei der Anmeldung mit Google ist etwas schiefgegangen. Bitte versuch es noch einmal."),
  "email-unbestaetigt": msg("Deine E-Mail-Adresse ist bei Google nicht bestätigt. Bestätige sie dort oder registriere dich mit Passwort."),
  gesperrt: msg("Dieses Konto ist gesperrt. Bitte wende dich an den Support."),
  "link-ungueltig": msg("Der Link ist ungültig oder abgelaufen. Fordere einfach einen neuen an."),
};

const INFOS: Record<string, string> = {
  "konto-geloescht": msg("Dein Konto und alle zugehörigen Daten wurden gelöscht."),
  bestaetigt: msg("Danke! Deine E-Mail-Adresse ist bestätigt. Du kannst dich jetzt anmelden."),
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ fehler?: string; hinweis?: string }> }) {
  const { fehler, hinweis } = await searchParams;
  const t = await getT();
  return (
    <AuthForm
      mode="login"
      google={googleEnabled()}
      notice={fehler && ERRORS[fehler] ? t(ERRORS[fehler]) : undefined}
      info={hinweis && INFOS[hinweis] ? t(INFOS[hinweis]) : undefined}
    />
  );
}
