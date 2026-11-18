import { NextResponse, type NextRequest } from "next/server";

// Schnelle Vorprüfung: Ohne Session-Cookie direkt zum Login.
// Die eigentliche Prüfung der Session passiert serverseitig in requireUser().
const PROTECTED = ["/dashboard", "/konten", "/zahlungen", "/transaktionen", "/ziele", "/einstellungen", "/anpassen", "/import", "/bankkonten", "/ruecklagen", "/admin"];

export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("vks_session");
  const { pathname } = req.nextUrl;
  if (!hasSession && PROTECTED.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
