// Anmeldung mit Google (OpenID Connect, Authorization Code Flow mit PKCE).
// Ohne zusätzliche Bibliothek: Google liefert das ID-Token direkt über eine TLS-Verbindung
// an unseren Server (Token-Endpunkt mit Client-Secret). Laut OpenID-Connect-Spezifikation
// genügt dann die Prüfung von iss, aud, exp und nonce, die Signatur muss nicht geprüft werden.

import { createHash, randomBytes } from "node:crypto";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export const GOOGLE_STATE_COOKIE = "vk_oauth_google";
export const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";

export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string };

export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return { clientId, clientSecret, redirectUri: `${base}${GOOGLE_CALLBACK_PATH}` };
}

export const googleEnabled = () => googleConfig() !== null;

const b64url = (buf: Buffer) => buf.toString("base64url");

/** Zufallswerte für eine Anmeldung: state (gegen CSRF), PKCE-Verifier und nonce (gegen Replay). */
export function createAuthRequest() {
  const verifier = b64url(randomBytes(32));
  return {
    state: b64url(randomBytes(24)),
    nonce: b64url(randomBytes(24)),
    verifier,
    challenge: b64url(createHash("sha256").update(verifier).digest()),
  };
}

export function buildAuthUrl(cfg: GoogleConfig, req: { state: string; nonce: string; challenge: string }) {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: req.state,
    nonce: req.nonce,
    code_challenge: req.challenge,
    code_challenge_method: "S256",
    // Kontoauswahl anzeigen, damit man bei mehreren Google-Konten wählen kann
    prompt: "select_account",
  }).toString();
  return url.toString();
}

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  givenName: string | null;
};

type IdTokenClaims = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nonce?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  given_name?: string;
};

/** Liest die Nutzlast eines JWT (ohne Signaturprüfung, siehe Kommentar oben). */
export function decodeJwtPayload(jwt: string): IdTokenClaims {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("Ungültiges ID-Token.");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as IdTokenClaims;
}

/** Prüft die Angaben im ID-Token und macht daraus ein Profil. */
export function profileFromIdToken(claims: IdTokenClaims, expected: { clientId: string; nonce: string; now?: number }): GoogleProfile {
  const now = Math.floor((expected.now ?? Date.now()) / 1000);
  if (!claims.iss || !ISSUERS.includes(claims.iss)) throw new Error("ID-Token stammt nicht von Google.");
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(expected.clientId)) throw new Error("ID-Token ist nicht für Vierklee ausgestellt.");
  if (!claims.exp || claims.exp < now - 60) throw new Error("ID-Token ist abgelaufen.");
  if (!claims.nonce || claims.nonce !== expected.nonce) throw new Error("Anmeldung passt nicht zur Anfrage (nonce).");
  if (!claims.sub || !claims.email) throw new Error("Google hat keine E-Mail-Adresse übermittelt.");
  return {
    sub: claims.sub,
    email: claims.email.trim().toLowerCase(),
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
    name: claims.name?.trim() || null,
    givenName: claims.given_name?.trim() || null,
  };
}

/** Tauscht den Code gegen Tokens und liefert das geprüfte Profil. */
export async function exchangeCode(cfg: GoogleConfig, code: string, verifier: string, nonce: string): Promise<GoogleProfile> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.id_token) throw new Error(`Google hat die Anmeldung abgelehnt${data.error ? ` (${data.error})` : ""}.`);
  return profileFromIdToken(decodeJwtPayload(data.id_token), { clientId: cfg.clientId, nonce });
}

/** Anzeigename für neue Konten: Vorname, sonst ganzer Name, sonst Teil vor dem @. */
export function displayName(p: Pick<GoogleProfile, "givenName" | "name" | "email">) {
  const raw = p.givenName || p.name || p.email.split("@")[0];
  return raw.slice(0, 60);
}
