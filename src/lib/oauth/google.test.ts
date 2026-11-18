import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAuthUrl, createAuthRequest, decodeJwtPayload, displayName, profileFromIdToken, type GoogleProfile } from "./google";

// ---------------------------------------------------------------------------
// Datenbank für signInWithGoogle im Speicher nachbauen
// ---------------------------------------------------------------------------
type U = { id: string; email: string; name: string; passwordHash: string | null; disabledAt: Date | null };
type A = { id: string; userId: string; provider: string; providerAccountId: string; email: string };
const db = { users: [] as U[], accounts: [] as A[] };
let n = 0;

vi.mock("../db", () => ({
  prisma: {
    oAuthAccount: {
      findUnique: async ({ where }: { where: { provider_providerAccountId: { provider: string; providerAccountId: string } } }) => {
        const k = where.provider_providerAccountId;
        const a = db.accounts.find((x) => x.provider === k.provider && x.providerAccountId === k.providerAccountId);
        return a ? { ...a, user: db.users.find((u) => u.id === a.userId)! } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<A> }) => Object.assign(db.accounts.find((a) => a.id === where.id)!, data),
      create: async ({ data }: { data: Omit<A, "id"> }) => {
        const a = { id: `a${++n}`, ...data };
        db.accounts.push(a);
        return a;
      },
    },
    user: {
      findUnique: async ({ where }: { where: { email: string } }) => db.users.find((u) => u.email === where.email) ?? null,
      create: async ({ data }: { data: Omit<U, "id" | "disabledAt"> & { oauthAccounts: { create: Omit<A, "id" | "userId"> } } }) => {
        const { oauthAccounts, ...rest } = data;
        const u = { id: `u${++n}`, disabledAt: null, ...rest };
        db.users.push(u);
        db.accounts.push({ id: `a${++n}`, userId: u.id, ...oauthAccounts.create });
        return u;
      },
    },
  },
}));
vi.mock("../data", () => ({ ensureUserSetup: async () => {} }));

const { signInWithGoogle } = await import("./signin");

const profile = (p: Partial<GoogleProfile> = {}): GoogleProfile => ({
  sub: "google-123",
  email: "lea@gmail.com",
  emailVerified: true,
  name: "Lea Muster",
  givenName: "Lea",
  ...p,
});

// ---------------------------------------------------------------------------

describe("Google: Anfrage", () => {
  it("PKCE: challenge ist SHA-256 des verifiers (base64url)", () => {
    const r = createAuthRequest();
    expect(r.challenge).toBe(createHash("sha256").update(r.verifier).digest("base64url"));
    expect(r.state).not.toBe(createAuthRequest().state);
  });

  it("baut die Google-URL mit allen Pflichtangaben", () => {
    const url = new URL(buildAuthUrl({ clientId: "cid", clientSecret: "x", redirectUri: "http://localhost:3000/api/auth/google/callback" }, { state: "s", nonce: "n", challenge: "c" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const q = Object.fromEntries(url.searchParams);
    expect(q).toMatchObject({
      client_id: "cid",
      redirect_uri: "http://localhost:3000/api/auth/google/callback",
      response_type: "code",
      scope: "openid email profile",
      state: "s",
      nonce: "n",
      code_challenge: "c",
      code_challenge_method: "S256",
    });
    expect(q.client_secret).toBeUndefined();
  });
});

describe("Google: ID-Token prüfen", () => {
  const now = Date.UTC(2026, 10, 18, 12) ;
  const good = { iss: "https://accounts.google.com", aud: "cid", exp: now / 1000 + 300, nonce: "n1", sub: "123", email: "Lea@Gmail.com ", email_verified: true, name: "Lea Muster", given_name: "Lea" };
  const check = (c: object) => profileFromIdToken(c, { clientId: "cid", nonce: "n1", now });

  it("akzeptiert ein gültiges Token und normalisiert die E-Mail", () => {
    expect(check(good)).toEqual({ sub: "123", email: "lea@gmail.com", emailVerified: true, name: "Lea Muster", givenName: "Lea" });
  });
  it("lehnt fremden Aussteller, fremde App, Ablauf und falsche nonce ab", () => {
    expect(() => check({ ...good, iss: "https://evil.example" })).toThrow(/Google/);
    expect(() => check({ ...good, aud: "andere-app" })).toThrow(/FinanzKlee/);
    expect(() => check({ ...good, exp: now / 1000 - 3600 })).toThrow(/abgelaufen/);
    expect(() => check({ ...good, nonce: "falsch" })).toThrow(/nonce/);
    expect(() => check({ ...good, email: undefined })).toThrow(/E-Mail/);
  });
  it("email_verified als Text wird verstanden, fehlend = unbestätigt", () => {
    expect(check({ ...good, email_verified: "true" }).emailVerified).toBe(true);
    expect(check({ ...good, email_verified: undefined }).emailVerified).toBe(false);
  });
  it("liest die Nutzlast eines JWT", () => {
    const jwt = ["e30", Buffer.from(JSON.stringify({ sub: "x" })).toString("base64url"), "sig"].join(".");
    expect(decodeJwtPayload(jwt)).toEqual({ sub: "x" });
    expect(() => decodeJwtPayload("kaputt")).toThrow();
  });
  it("Anzeigename: Vorname, sonst Name, sonst E-Mail-Anfang", () => {
    expect(displayName({ givenName: "Lea", name: "Lea M", email: "x@y.de" })).toBe("Lea");
    expect(displayName({ givenName: null, name: "Lea M", email: "x@y.de" })).toBe("Lea M");
    expect(displayName({ givenName: null, name: null, email: "lea.m@y.de" })).toBe("lea.m");
  });
});

describe("Google: Konto finden oder anlegen", () => {
  beforeEach(() => {
    db.users = [];
    db.accounts = [];
  });

  it("legt ein neues Konto ohne Passwort an und meldet beim zweiten Mal dasselbe Konto an", async () => {
    const first = await signInWithGoogle(profile());
    expect(first).toMatchObject({ ok: true, isNew: true });
    expect(db.users).toHaveLength(1);
    expect(db.users[0]).toMatchObject({ email: "lea@gmail.com", name: "Lea", passwordHash: null });

    const second = await signInWithGoogle(profile());
    expect(second).toEqual({ ok: true, userId: db.users[0].id, isNew: false });
    expect(db.users).toHaveLength(1);
  });

  it("verknüpft ein bestehendes Passwort-Konto mit gleicher, bestätigter E-Mail", async () => {
    db.users.push({ id: "u-alt", email: "lea@gmail.com", name: "Lea", passwordHash: "hash", disabledAt: null });
    const r = await signInWithGoogle(profile());
    expect(r).toEqual({ ok: true, userId: "u-alt", isNew: false });
    expect(db.accounts).toEqual([expect.objectContaining({ userId: "u-alt", provider: "google", providerAccountId: "google-123" })]);
    expect(db.users[0].passwordHash).toBe("hash");
  });

  it("verknüpft oder erstellt nichts, wenn Google die E-Mail nicht bestätigt hat", async () => {
    db.users.push({ id: "u-alt", email: "lea@gmail.com", name: "Lea", passwordHash: "hash", disabledAt: null });
    expect(await signInWithGoogle(profile({ emailVerified: false }))).toEqual({ ok: false, error: "email-unbestaetigt" });
    expect(db.accounts).toHaveLength(0);
  });

  it("gesperrte Konten kommen nicht rein", async () => {
    db.users.push({ id: "u-gesperrt", email: "lea@gmail.com", name: "Lea", passwordHash: null, disabledAt: new Date() });
    expect(await signInWithGoogle(profile())).toEqual({ ok: false, error: "gesperrt" });
  });
});
