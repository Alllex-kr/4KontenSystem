import { googleEnabled } from "@/lib/oauth/google";
import { AuthForm } from "../AuthForm";

export default function RegisterPage() {
  return <AuthForm mode="register" google={googleEnabled()} />;
}
