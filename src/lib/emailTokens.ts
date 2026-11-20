// Einmal-Links für E-Mails. Das Token steht nur im Link, in der Datenbank liegt sein Hash.
import { randomBytes } from "node:crypto";
import { prisma } from "./db";
import { hashToken } from "./auth";

export type TokenPurpose = "RESET_PASSWORD" | "VERIFY_EMAIL";

/** Gültigkeit: Passwort-Links kurz (Sicherheit), Bestätigungslinks länger (Komfort). */
export const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  RESET_PASSWORD: 60 * 60_000,
  VERIFY_EMAIL: 48 * 60 * 60_000,
};

/**
 * Legt ein neues Token an. Ältere, noch offene Tokens desselben Zwecks werden ungültig,
 * benutzte und abgelaufene Tokens dieses Nutzers werden aufgeräumt.
 */
export async function createEmailToken(userId: string, purpose: TokenPurpose) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await prisma.$transaction([
    prisma.emailToken.deleteMany({ where: { userId, purpose, usedAt: null } }),
    prisma.emailToken.deleteMany({ where: { userId, OR: [{ usedAt: { not: null } }, { expiresAt: { lt: now } }] } }),
    prisma.emailToken.create({
      data: { userId, purpose, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TOKEN_TTL_MS[purpose]) },
    }),
  ]);
  return token;
}

async function findValid(token: string, purpose: TokenPurpose) {
  if (!token || token.length > 200) return null;
  const row = await prisma.emailToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < new Date()) return null;
  return row;
}

/** Ist das Token gültig? (ohne es zu verbrauchen, z. B. um das Formular anzuzeigen) */
export async function checkEmailToken(token: string, purpose: TokenPurpose) {
  return Boolean(await findValid(token, purpose));
}

/** Verbraucht das Token genau einmal und gibt die Nutzer-ID zurück, sonst null. */
export async function consumeEmailToken(token: string, purpose: TokenPurpose): Promise<string | null> {
  const row = await findValid(token, purpose);
  if (!row) return null;
  // updateMany mit usedAt: null verhindert, dass zwei gleichzeitige Anfragen dasselbe Token nutzen
  const { count } = await prisma.emailToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  return count === 1 ? row.userId : null;
}
