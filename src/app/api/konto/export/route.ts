// Datenexport (DSGVO Art. 15 und 20): alle eigenen Daten als JSON-Datei.
// Ausgelassen sind nur Geheimnisse: Passwort-Hash, Sitzungen, Einmal-Links und verschlüsselte Bank-Zugänge.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const data = await prisma.user.findUnique({
    where: { id: current.id },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      emailVerifiedAt: true,
      lastSeenAt: true,
      plan: { select: { name: true } },
      settings: true,
      accounts: true,
      payments: true,
      transactions: true,
      goals: true,
      reserveItems: { include: { purchases: true } },
      importRules: true,
      aiUsage: true,
      oauthAccounts: { select: { provider: true, email: true, createdAt: true, lastLoginAt: true } },
      bankConnections: {
        select: {
          provider: true,
          bankName: true,
          status: true,
          lastSyncAt: true,
          createdAt: true,
          accounts: { select: { name: true, ibanMasked: true, balanceCents: true, currency: true, accountType: true, lastSyncAt: true } },
        },
      },
    },
  });
  if (!data) return NextResponse.json({ error: "Konto nicht gefunden" }, { status: 404 });

  const body = JSON.stringify(
    { exportiertAm: new Date().toISOString(), hinweis: "Alle Geldbeträge in Cent (z. B. 1250 = 12,50 €).", ...data },
    null,
    2,
  );
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="finanzklee-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
