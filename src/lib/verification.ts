// Bestätigungs-E-Mail. Bewusst keine Server Action (die wären vom Browser aus mit beliebigen Werten aufrufbar).
import { createEmailToken } from "./emailTokens";
import { buttonMail, sendMail } from "./mail";
import { appUrl } from "./banking";
import type { T } from "./i18n/translate";

export async function sendVerificationMail(user: { id: string; name: string; email: string }, t: T) {
  const token = await createEmailToken(user.id, "VERIFY_EMAIL");
  return sendMail(
    buttonMail({
      to: user.email,
      subject: t("Bitte bestätige deine E-Mail-Adresse"),
      greeting: t("Hallo {name},", { name: user.name }),
      intro: t("schön, dass du bei FinanzKlee bist! Bitte bestätige mit einem Klick, dass diese E-Mail-Adresse dir gehört."),
      button: t("E-Mail bestätigen"),
      url: `${appUrl()}/api/email/bestaetigen?token=${token}`,
      outro: t("Der Link gilt 48 Stunden. Wenn du dich nicht bei FinanzKlee registriert hast, kannst du diese E-Mail ignorieren."),
    }),
  );
}
