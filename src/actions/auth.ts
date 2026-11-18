"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, destroySession, rememberAppearance } from "@/lib/auth";
import { ensureUserSetup } from "@/lib/data";
import type { ActionState } from "./types";
import { getT } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";

const registerSchema = z.object({
  name: z.string().trim().min(2, msg("Bitte gib deinen Namen an.")).max(60),
  email: z.string().trim().toLowerCase().email(msg("Bitte gib eine gültige E-Mail-Adresse an.")),
  password: z.string().min(8, msg("Das Passwort muss mindestens 8 Zeichen haben.")).max(200),
});

export async function register(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getT();
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t(parsed.error.issues[0].message) };
  const { name, email, password } = parsed.data;

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return {
      error: exists.passwordHash
        ? t("Für diese E-Mail gibt es schon ein Konto.")
        : t("Für diese E-Mail gibt es schon ein Konto. Melde dich mit Google an."),
    };
  }

  const user = await prisma.user.create({
    data: { name, email, passwordHash: await bcrypt.hash(password, 12) },
  });
  await ensureUserSetup(user.id);
  await createSession(user.id);
  redirect("/dashboard?willkommen=1");
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(msg("Bitte gib eine gültige E-Mail-Adresse an.")),
  password: z.string().min(1, msg("Bitte gib dein Passwort ein.")),
});

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getT();
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t(parsed.error.issues[0].message) };
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  // Gleiche Meldung für unbekannte E-Mail und falsches Passwort.
  if (user && !user.passwordHash) return { error: t("Dieses Konto nutzt die Anmeldung mit Google. Tippe oben auf „Mit Google fortfahren“.") };
  const ok = user?.passwordHash ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;
  if (!user || !ok) return { error: t("E-Mail oder Passwort ist falsch.") };
  if (user.disabledAt) return { error: t("Dieses Konto ist gesperrt. Bitte wende dich an den Support.") };
  await createSession(user.id);
  await rememberAppearance(user.id);
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
