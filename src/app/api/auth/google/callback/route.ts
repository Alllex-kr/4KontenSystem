import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createSession, rememberAppearance } from "@/lib/auth";
import { GOOGLE_STATE_COOKIE, exchangeCode, googleConfig } from "@/lib/oauth/google";
import { signInWithGoogle } from "@/lib/oauth/signin";

const sameString = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Schritt 2: Rücksprung von Google. Prüfen, Konto finden oder anlegen, Sitzung starten. */
export async function GET(req: NextRequest) {
  const fail = (code: string) => NextResponse.redirect(new URL(`/login?fehler=${code}`, req.url));
  const cfg = googleConfig();
  if (!cfg) return fail("google-aus");

  const jar = await cookies();
  const raw = jar.get(GOOGLE_STATE_COOKIE)?.value;
  jar.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/auth/google" });

  const params = req.nextUrl.searchParams;
  if (params.get("error")) return fail("google-abgebrochen");
  const code = params.get("code");
  const state = params.get("state");

  let saved: { state?: string; verifier?: string; nonce?: string } = {};
  try {
    saved = raw ? JSON.parse(raw) : {};
  } catch {
    saved = {};
  }
  if (!code || !state || !saved.state || !saved.verifier || !saved.nonce || !sameString(state, saved.state)) {
    return fail("google-abgelaufen");
  }

  try {
    const profile = await exchangeCode(cfg, code, saved.verifier, saved.nonce);
    const result = await signInWithGoogle(profile);
    if (!result.ok) return fail(result.error);
    await createSession(result.userId);
    await rememberAppearance(result.userId);
    return NextResponse.redirect(new URL(result.isNew ? "/dashboard?willkommen=1" : "/dashboard", req.url));
  } catch (e) {
    console.error("[Google-Anmeldung]", e instanceof Error ? e.message : e);
    return fail("google-fehler");
  }
}
