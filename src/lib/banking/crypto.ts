import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM für Anbieter-Zugangsdaten (z. B. das Passwort des finAPI-Users).
 * Bank-Zugangsdaten der Nutzer speichert Vierklee NIE – die gibt man nur im Web-Formular des Anbieters ein.
 *
 * Schlüssel: BANKING_ENCRYPTION_KEY = 32 Byte als Base64 (z. B. `openssl rand -base64 32`) oder 64 Hex-Zeichen.
 */
function getKey(raw = process.env.BANKING_ENCRYPTION_KEY): Buffer {
  if (!raw) throw new Error("BANKING_ENCRYPTION_KEY fehlt in der .env (32 Byte, z. B. `openssl rand -base64 32`).");
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("BANKING_ENCRYPTION_KEY muss genau 32 Byte lang sein.");
  return key;
}

export function encryptSecret(plain: string, rawKey?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(rawKey), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(":");
}

export function decryptSecret(enc: string, rawKey?: string): string {
  const [v, iv, tag, data] = enc.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unbekanntes Format des verschlüsselten Werts.");
  const decipher = createDecipheriv("aes-256-gcm", getKey(rawKey), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export function hasEncryptionKey(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

/** Zufälliges Passwort aus Buchstaben und Ziffern. */
export function randomToken(length: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
