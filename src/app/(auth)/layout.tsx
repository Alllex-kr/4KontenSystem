import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect("/dashboard");
  return <main className="flex min-h-dvh items-center justify-center px-4 py-8 sm:py-12">{children}</main>;
}
