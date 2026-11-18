import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_STATE_COOKIE, buildAuthUrl, createAuthRequest, googleConfig } from "@/lib/oauth/google";

/** Schritt 1: zur Google-Anmeldung weiterleiten. */
export async function GET(req: NextRequest) {
  const cfg = googleConfig();
  if (!cfg) return NextResponse.redirect(new URL("/login?fehler=google-aus", req.url));

  const auth = createAuthRequest();
  const res = NextResponse.redirect(buildAuthUrl(cfg, auth));
  // Nur für den Rücksprung von Google: 10 Minuten, nur auf dem Callback-Pfad lesbar
  res.cookies.set(GOOGLE_STATE_COOKIE, JSON.stringify({ state: auth.state, verifier: auth.verifier, nonce: auth.nonce }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return res;
}
