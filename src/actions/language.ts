"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";

/** Sprache wechseln. "auto" = wieder der Browsersprache folgen. Gilt im Konto und auf diesem Gerät. */
export async function setLanguage(locale: string) {
  const jar = await cookies();
  if (locale === "auto") jar.delete(LOCALE_COOKIE);
  else if (isLocale(locale)) jar.set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365, httpOnly: true });
  else return;
  const user = await getCurrentUser();
  if (user) await prisma.settings.updateMany({ where: { userId: user.id }, data: { language: locale === "auto" ? null : locale } });
  revalidatePath("/", "layout");
}
