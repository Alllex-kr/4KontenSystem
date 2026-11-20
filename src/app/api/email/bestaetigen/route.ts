// Link aus der Bestätigungs-E-Mail: /api/email/bestaetigen?token=…
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { consumeEmailToken } from "@/lib/emailTokens";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const userId = await consumeEmailToken(token, "VERIFY_EMAIL");
  const current = await getCurrentUser();

  if (!userId) {
    // Schon bestätigt (z. B. Link doppelt geklickt)? Dann ist alles gut.
    if (current) {
      const me = await prisma.user.findUnique({ where: { id: current.id }, select: { emailVerifiedAt: true } });
      if (me?.emailVerifiedAt) return NextResponse.redirect(new URL("/dashboard?bestaetigt=1", req.url));
    }
    return NextResponse.redirect(new URL(current ? "/dashboard?bestaetigt=fehler" : "/login?fehler=link-ungueltig", req.url));
  }

  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return NextResponse.redirect(new URL(current ? "/dashboard?bestaetigt=1" : "/login?hinweis=bestaetigt", req.url));
}
