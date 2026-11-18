import { prisma } from "../db";
import { ensureUserSetup } from "../data";
import { displayName, type GoogleProfile } from "./google";

export type OAuthResult = { ok: true; userId: string; isNew: boolean } | { ok: false; error: string };

/**
 * Findet oder erstellt das Vierklee-Konto zu einem Google-Profil:
 * 1. Schon verknüpft → dieses Konto.
 * 2. Konto mit derselben (von Google bestätigten) E-Mail → verknüpfen.
 * 3. Sonst neues Konto ohne Passwort.
 */
export async function signInWithGoogle(profile: GoogleProfile): Promise<OAuthResult> {
  const linked = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: "google", providerAccountId: profile.sub } },
    include: { user: { select: { id: true, disabledAt: true } } },
  });
  if (linked) {
    if (linked.user.disabledAt) return { ok: false, error: "gesperrt" };
    await prisma.oAuthAccount.update({ where: { id: linked.id }, data: { lastLoginAt: new Date(), email: profile.email } });
    return { ok: true, userId: linked.user.id, isNew: false };
  }

  // Ohne bestätigte E-Mail weder verknüpfen noch anlegen (sonst könnte jemand ein fremdes Konto übernehmen)
  if (!profile.emailVerified) return { ok: false, error: "email-unbestaetigt" };

  const existing = await prisma.user.findUnique({ where: { email: profile.email }, select: { id: true, disabledAt: true } });
  if (existing) {
    if (existing.disabledAt) return { ok: false, error: "gesperrt" };
    await prisma.oAuthAccount.create({ data: { userId: existing.id, provider: "google", providerAccountId: profile.sub, email: profile.email } });
    return { ok: true, userId: existing.id, isNew: false };
  }

  const user = await prisma.user.create({
    data: {
      email: profile.email,
      name: displayName(profile),
      passwordHash: null,
      oauthAccounts: { create: { provider: "google", providerAccountId: profile.sub, email: profile.email } },
    },
  });
  await ensureUserSetup(user.id);
  return { ok: true, userId: user.id, isNew: true };
}
