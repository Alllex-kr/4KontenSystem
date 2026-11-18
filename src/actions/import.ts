"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireFeature } from "@/lib/access";
import { CATEGORIES } from "@/lib/constants";

const MAX_ROWS = 3000;
const hashSchema = z.string().regex(/^[a-z0-9]{4,20}$/);

async function ownAccount(userId: string, accountId: string) {
  const acc = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!acc) throw new Error("Konto nicht gefunden.");
  return acc;
}

async function existingHashes(userId: string, accountId: string, hashes: string[]) {
  const found = new Set<string>();
  // In Blöcken abfragen (SQLite-Grenze für Parameter)
  for (let i = 0; i < hashes.length; i += 400) {
    const chunk = hashes.slice(i, i + 400);
    const rows = await prisma.transaction.findMany({
      where: { userId, accountId, importHash: { in: chunk } },
      select: { importHash: true },
    });
    rows.forEach((r) => r.importHash && found.add(r.importHash));
  }
  return found;
}

/** Welche Umsätze wurden in dieses Konto schon importiert? */
export async function checkDuplicates(input: { accountId: string; hashes: string[] }): Promise<string[]> {
  const user = await requireFeature("import.csv");
  const parsed = z.object({ accountId: z.string(), hashes: z.array(hashSchema).max(MAX_ROWS) }).safeParse(input);
  if (!parsed.success) return [];
  await ownAccount(user.id, parsed.data.accountId);
  return [...(await existingHashes(user.id, parsed.data.accountId, parsed.data.hashes))];
}

const importSchema = z.object({
  accountId: z.string(),
  rows: z
    .array(
      z.object({
        hash: hashSchema,
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        amountCents: z.number().int().refine((v) => v !== 0 && Math.abs(v) < 100_000_000, "Ungültiger Betrag"),
        description: z.string().trim().min(1).max(100),
        category: z.enum(CATEGORIES),
        /** Kategorie wurde von Hand geändert (user) oder von Claude vorgeschlagen (ai) → als Regel merken */
        learnPattern: z.string().trim().min(2).max(60).optional(),
        learnSource: z.enum(["user", "ai"]).optional(),
      }),
    )
    .min(1, "Keine Umsätze ausgewählt.")
    .max(MAX_ROWS, `Maximal ${MAX_ROWS} Umsätze pro Import.`),
  balanceMode: z.enum(["keep", "add", "set"]),
  balanceCents: z.number().int().optional(),
});

export type ImportResult = { error?: string; imported?: number; skipped?: number; learned?: number };

export async function importTransactions(input: z.input<typeof importSchema>): Promise<ImportResult> {
  const user = await requireFeature("import.csv");
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Daten." };
  const { accountId, rows, balanceMode, balanceCents } = parsed.data;
  if (balanceMode === "set" && balanceCents === undefined) return { error: "Bitte den aktuellen Kontostand angeben." };
  await ownAccount(user.id, accountId);

  const dupes = await existingHashes(user.id, accountId, rows.map((r) => r.hash));
  const unique = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!dupes.has(r.hash) && !unique.has(r.hash)) unique.set(r.hash, r);
  const fresh = [...unique.values()];
  const sum = fresh.reduce((s, r) => s + r.amountCents, 0);

  // Gelernte Regeln (letzte Änderung je Empfänger gewinnt; deine Korrekturen haben Vorrang vor der KI)
  const rules = new Map<string, { category: string; source: "user" | "ai" }>();
  for (const r of rows) {
    if (!r.learnPattern) continue;
    const key = r.learnPattern.toLowerCase();
    const source = r.learnSource ?? "user";
    if (source === "ai" && rules.get(key)?.source === "user") continue;
    rules.set(key, { category: r.category, source });
  }

  await prisma.$transaction([
    prisma.transaction.createMany({
      data: fresh.map((r) => ({
        userId: user.id,
        accountId,
        amountCents: r.amountCents,
        date: new Date(`${r.date}T12:00:00`),
        description: r.description,
        category: r.category,
        importHash: r.hash,
      })),
    }),
    ...(balanceMode === "add" && sum !== 0
      ? [prisma.account.update({ where: { id: accountId }, data: { balanceCents: { increment: sum } } })]
      : []),
    ...(balanceMode === "set"
      ? [prisma.account.update({ where: { id: accountId }, data: { balanceCents: balanceCents!, balanceUpdatedAt: new Date() } })]
      : []),
    ...[...rules.entries()].map(([pattern, { category, source }]) =>
      prisma.importRule.upsert({
        where: { userId_pattern: { userId: user.id, pattern } },
        // Eine KI-Regel überschreibt nie eine bestehende Regel
        update: source === "user" ? { category, source } : {},
        create: { userId: user.id, pattern, category, source },
      }),
    ),
  ]);

  revalidatePath("/", "layout");
  return { imported: fresh.length, skipped: rows.length - fresh.length, learned: rules.size };
}

export async function deleteImportRule(formData: FormData) {
  const user = await requireFeature("import.csv");
  await prisma.importRule.deleteMany({ where: { id: String(formData.get("id")), userId: user.id } });
  revalidatePath("/import");
}
