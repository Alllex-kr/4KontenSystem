"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, destroySession, requireUser } from "@/lib/auth";
import { consumeEmailToken, createEmailToken } from "@/lib/emailTokens";
import { sendVerificationMail } from "@/lib/verification";
import { buttonMail, sendMail } from "@/lib/mail";
import { appUrl, getProvider, type ProviderId } from "@/lib/banking";
import { LIMITS, clientIp, rateLimiter, waitMinutes } from "@/lib/rateLimit";
import { getT } from "@/lib/i18n/server";
import { msg, type T } from "@/lib/i18n/translate";
import type { ActionState } from "./types";

const tooMany = (t: T, ms: number) => ({ error: t("Zu viele Versuche. Bitte versuche es in etwa {n} Min. noch einmal.", { n: waitMinutes(ms) }) });

// ---------------------------------------------------------------------------
// Passwort vergessen
// ---------------------------------------------------------------------------

const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email(msg("Bitte gib eine gültige E-Mail-Adresse an.")),
});

export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getT();
  const parsed = emailSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t(parsed.error.issues[0].message) };
  const { email } = parsed.data;

  const ipKey = `reset:ip:${clientIp(await headers())}`;
  const emailKey = `reset:email:${email}`;
  const wait = Math.max(rateLimiter.blockedFor(ipKey, LIMITS.resetPerIp), rateLimiter.blockedFor(emailKey, LIMITS.resetPerEmail));
  if (wait) return tooMany(t, wait);
  rateLimiter.hit(ipKey, LIMITS.resetPerIp);
  rateLimiter.hit(emailKey, LIMITS.resetPerEmail);

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, disabledAt: true } });
  if (user && !user.disabledAt) {
    const token = await createEmailToken(user.id, "RESET_PASSWORD");
    await sendMail(
      buttonMail({
        to: user.email,
        subject: t("Passwort zurücksetzen"),
        greeting: t("Hallo {name},", { name: user.name }),
        intro: t("du möchtest ein neues Passwort für FinanzKlee festlegen. Klick dafür auf den Button."),
        button: t("Neues Passwort festlegen"),
        url: `${appUrl()}/passwort-neu?token=${token}`,
        outro: t("Der Link gilt 1 Stunde und funktioniert nur einmal. Wenn du das nicht warst, ignoriere diese E-Mail. Dein Passwort bleibt dann unverändert."),
      }),
    );
  }
  // Immer dieselbe Antwort: Niemand soll herausfinden können, ob eine E-Mail-Adresse registriert ist.
  return { success: t("Wenn es ein Konto mit dieser E-Mail gibt, haben wir dir einen Link geschickt. Schau auch im Spam-Ordner nach.") };
}

const resetSchema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(8, msg("Das Passwort muss mindestens 8 Zeichen haben.")).max(200),
});

export async function resetPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getT();
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t(parsed.error.issues[0].message) };

  const userId = await consumeEmailToken(parsed.data.token, "RESET_PASSWORD");
  if (!userId) return { error: t("Der Link ist ungültig oder abgelaufen. Fordere einfach einen neuen an.") };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { disabledAt: true, emailVerifiedAt: true } });
  if (!user || user.disabledAt) return { error: t("Dieses Konto ist gesperrt. Bitte wende dich an den Support.") };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      // Wer den Link aus der E-Mail nutzt, hat Zugriff auf das Postfach: E-Mail gilt damit als bestätigt
      data: { passwordHash: await bcrypt.hash(parsed.data.password, 12), emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
    }),
    // Auf allen Geräten abmelden: Falls jemand anderes das alte Passwort kannte, fliegt er raus
    prisma.session.deleteMany({ where: { userId } }),
  ]);
  await createSession(userId);
  redirect("/dashboard?passwort=neu");
}

// ---------------------------------------------------------------------------
// E-Mail bestätigen
// ---------------------------------------------------------------------------

export async function resendVerification(_prev: ActionState): Promise<ActionState> {
  const t = await getT();
  const sessionUser = await requireUser();
  const user = await prisma.user.findUnique({ where: { id: sessionUser.id }, select: { id: true, name: true, email: true, emailVerifiedAt: true } });
  if (!user) return { error: t("Konto nicht gefunden.") };
  if (user.emailVerifiedAt) return { success: t("Deine E-Mail-Adresse ist schon bestätigt.") };

  const key = `verify:user:${user.id}`;
  const wait = rateLimiter.blockedFor(key, LIMITS.verifyResendPerUser);
  if (wait) return tooMany(t, wait);
  rateLimiter.hit(key, LIMITS.verifyResendPerUser);

  const sent = await sendVerificationMail(user, t);
  if (!sent && process.env.NODE_ENV === "production") {
    return { error: t("Die E-Mail konnte gerade nicht gesendet werden. Bitte versuch es später noch einmal.") };
  }
  return { success: t("Wir haben dir eine neue Bestätigungs-E-Mail an {email} geschickt.", { email: user.email }) };
}

// ---------------------------------------------------------------------------
// Konto löschen
// ---------------------------------------------------------------------------

export async function deleteAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getT();
  const sessionUser = await requireUser();
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, email: true, passwordHash: true, bankConnections: { select: { id: true, provider: true, externalId: true } } },
  });
  if (!user) return { error: t("Konto nicht gefunden.") };

  if (formData.get("confirm") !== "on") return { error: t("Bitte bestätige, dass du dein Konto endgültig löschen willst.") };

  const key = `delete:user:${user.id}`;
  const wait = rateLimiter.blockedFor(key, LIMITS.deletePerUser);
  if (wait) return tooMany(t, wait);

  if (user.passwordHash) {
    const password = String(formData.get("password") ?? "");
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      rateLimiter.hit(key, LIMITS.deletePerUser);
      return { error: t("Das Passwort ist falsch.") };
    }
  } else if (String(formData.get("email") ?? "").trim().toLowerCase() !== user.email) {
    // Konten nur mit Google-Anmeldung haben kein Passwort: zur Bestätigung die E-Mail-Adresse eintippen
    return { error: t("Bitte gib zur Bestätigung deine E-Mail-Adresse ein.") };
  }

  // Bankverbindungen auch beim Anbieter entfernen (so gut es geht; das Löschen hier hängt nicht davon ab)
  for (const c of user.bankConnections) {
    if (!c.externalId) continue;
    try {
      await getProvider(c.provider as ProviderId).deleteConnection({ userId: user.id, connectionId: c.id }, c.externalId);
    } catch (e) {
      console.error("[Konto löschen] Bankverbindung beim Anbieter nicht entfernt:", e instanceof Error ? e.message : e);
    }
  }

  // Alle zugehörigen Daten hängen per onDelete: Cascade am Nutzer und werden mitgelöscht
  await prisma.user.delete({ where: { id: user.id } });
  rateLimiter.reset(key);
  await destroySession();
  redirect("/login?hinweis=konto-geloescht");
}
