import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "./db";
import { APPEARANCE_COOKIE, normalizeAppearance } from "./appearance";

export const SESSION_COOKIE = "vks_session";
const SESSION_DAYS = 30;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Legt eine Session an. In der DB liegt nur der Hash des Tokens, das Token selbst nur im Cookie. */
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Darstellung des Kontos auf diesem Gerät merken (gilt dann auch nach dem Abmelden). */
export async function rememberAppearance(userId: string) {
  const settings = await prisma.settings.findUnique({ where: { userId } });
  if (!settings) return;
  const a = normalizeAppearance(settings);
  (await cookies()).set(APPEARANCE_COOKIE, encodeURIComponent(JSON.stringify({ theme: a.theme, accent: a.accent, fontScale: a.fontScale, motion: a.motion })), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true, disabledAt: true, lastSeenAt: true } } },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  const { disabledAt, lastSeenAt, ...user } = session.user;
  // Gesperrt: Sitzung gilt nicht mehr
  if (disabledAt) return null;
  // "Zuletzt aktiv" für den Adminbereich, höchstens einmal pro Minute schreiben
  if (!lastSeenAt || Date.now() - lastSeenAt.getTime() > 60_000) {
    await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
