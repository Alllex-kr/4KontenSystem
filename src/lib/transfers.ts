import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import type { AccountKind } from "./constants";

/** Umbuchung zwischen zwei eigenen Konten: zwei Buchungen + Kontostände (nur serverseitig verwenden). */
export async function bookTransfer(userId: string, fromKind: AccountKind, toKind: AccountKind, amountCents: number, note?: string) {
  if (fromKind === toKind) throw new Error("Bitte zwei verschiedene Konten wählen.");
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("Der Betrag muss größer als 0 sein.");
  const [from, to] = await Promise.all([
    prisma.account.findFirst({ where: { userId, kind: fromKind } }),
    prisma.account.findFirst({ where: { userId, kind: toKind } }),
  ]);
  if (!from || !to) throw new Error("Konto nicht gefunden.");
  const description = note?.trim() || `Umbuchung ${from.name} → ${to.name}`;
  const group = randomUUID();
  const date = new Date();
  await prisma.$transaction([
    prisma.transaction.create({ data: { userId, accountId: from.id, amountCents: -amountCents, date, description, category: "Umbuchung", transferGroup: group } }),
    prisma.transaction.create({ data: { userId, accountId: to.id, amountCents, date, description, category: "Umbuchung", transferGroup: group } }),
    prisma.account.update({ where: { id: from.id }, data: { balanceCents: { decrement: amountCents } } }),
    prisma.account.update({ where: { id: to.id }, data: { balanceCents: { increment: amountCents } } }),
  ]);
  return { from: from.name, to: to.name };
}
