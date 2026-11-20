import { getT } from "@/lib/i18n/server";
import { ForgotPasswordForm } from "../AccountForms";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Passwort vergessen?") };
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
