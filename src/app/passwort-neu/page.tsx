// Liegt bewusst außerhalb von (auth): Der Link aus der E-Mail soll auch funktionieren, wenn man gerade angemeldet ist.
import { checkEmailToken } from "@/lib/emailTokens";
import { getT } from "@/lib/i18n/server";
import { InvalidLink, ResetPasswordForm } from "../(auth)/AccountForms";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Neues Passwort festlegen"), robots: { index: false } };
}

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const valid = await checkEmailToken(token, "RESET_PASSWORD");
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8 sm:py-12">
      {valid ? <ResetPasswordForm token={token} /> : <InvalidLink />}
    </main>
  );
}
