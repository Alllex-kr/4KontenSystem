import { googleEnabled } from "@/lib/oauth/google";
import { AuthForm } from "../AuthForm";

const GOOGLE_ERRORS: Record<string, string> = {
  "google-aus": "Die Anmeldung mit Google ist noch nicht eingerichtet.",
  "google-abgebrochen": "Die Anmeldung mit Google wurde abgebrochen.",
  "google-abgelaufen": "Die Anmeldung mit Google ist abgelaufen. Bitte versuch es noch einmal.",
  "google-fehler": "Bei der Anmeldung mit Google ist etwas schiefgegangen. Bitte versuch es noch einmal.",
  "email-unbestaetigt": "Deine E-Mail-Adresse ist bei Google nicht bestätigt. Bestätige sie dort oder registriere dich mit Passwort.",
  gesperrt: "Dieses Konto ist gesperrt. Bitte wende dich an den Support.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ fehler?: string }> }) {
  const { fehler } = await searchParams;
  return <AuthForm mode="login" google={googleEnabled()} notice={fehler ? (GOOGLE_ERRORS[fehler] ?? undefined) : undefined} />;
}
