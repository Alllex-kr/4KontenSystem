import { beforeEach, describe, expect, it, vi } from "vitest";

// Tabelle EmailToken im Speicher nachbauen
type Row = { id: string; userId: string; purpose: string; tokenHash: string; expiresAt: Date; usedAt: Date | null };
let rows: Row[] = [];
let n = 0;

vi.mock("./db", () => {
  const emailToken = {
    deleteMany: async ({ where }: { where: { userId: string; purpose?: string; OR?: unknown[] } }) => {
      const before = rows.length;
      const now = new Date();
      rows = rows.filter((r) => {
        if (r.userId !== where.userId) return true;
        if (where.OR) return !(r.usedAt !== null || r.expiresAt < now); // benutzt oder abgelaufen
        return !(r.purpose === where.purpose && r.usedAt === null);
      });
      return { count: before - rows.length };
    },
    create: async ({ data }: { data: Omit<Row, "id" | "usedAt"> }) => {
      const r = { id: `t${++n}`, usedAt: null, ...data };
      rows.push(r);
      return r;
    },
    findUnique: async ({ where }: { where: { tokenHash: string } }) => rows.find((r) => r.tokenHash === where.tokenHash) ?? null,
    updateMany: async ({ where, data }: { where: { id: string; usedAt: null }; data: Partial<Row> }) => {
      const hit = rows.filter((r) => r.id === where.id && r.usedAt === null);
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    },
  };
  return { prisma: { emailToken, $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops) } };
});

const { createEmailToken, consumeEmailToken, checkEmailToken } = await import("./emailTokens");

describe("Einmal-Links", () => {
  beforeEach(() => {
    rows = [];
    vi.useRealTimers();
  });

  it("speichert nur den Hash, nicht das Token", async () => {
    const token = await createEmailToken("u1", "RESET_PASSWORD");
    expect(token.length).toBeGreaterThan(30);
    expect(rows[0].tokenHash).not.toBe(token);
  });

  it("funktioniert genau einmal", async () => {
    const token = await createEmailToken("u1", "RESET_PASSWORD");
    expect(await checkEmailToken(token, "RESET_PASSWORD")).toBe(true);
    expect(await consumeEmailToken(token, "RESET_PASSWORD")).toBe("u1");
    expect(await consumeEmailToken(token, "RESET_PASSWORD")).toBeNull();
    expect(await checkEmailToken(token, "RESET_PASSWORD")).toBe(false);
  });

  it("gilt nur für seinen Zweck", async () => {
    const token = await createEmailToken("u1", "VERIFY_EMAIL");
    expect(await consumeEmailToken(token, "RESET_PASSWORD")).toBeNull();
    expect(await consumeEmailToken(token, "VERIFY_EMAIL")).toBe("u1");
  });

  it("läuft ab", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    const token = await createEmailToken("u1", "RESET_PASSWORD");
    vi.setSystemTime(new Date("2026-01-01T11:00:01Z"));
    expect(await consumeEmailToken(token, "RESET_PASSWORD")).toBeNull();
  });

  it("ein neuer Link macht den alten ungültig", async () => {
    const first = await createEmailToken("u1", "RESET_PASSWORD");
    const second = await createEmailToken("u1", "RESET_PASSWORD");
    expect(await consumeEmailToken(first, "RESET_PASSWORD")).toBeNull();
    expect(await consumeEmailToken(second, "RESET_PASSWORD")).toBe("u1");
  });

  it("räumt benutzte Links auf", async () => {
    const a = await createEmailToken("u1", "VERIFY_EMAIL");
    await consumeEmailToken(a, "VERIFY_EMAIL");
    await createEmailToken("u1", "RESET_PASSWORD");
    expect(rows.map((r) => r.purpose)).toEqual(["RESET_PASSWORD"]);
  });

  it("lehnt Unsinn ab", async () => {
    expect(await consumeEmailToken("", "RESET_PASSWORD")).toBeNull();
    expect(await consumeEmailToken("x".repeat(500), "RESET_PASSWORD")).toBeNull();
  });
});
