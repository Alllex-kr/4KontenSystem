import { PrismaClient } from "@prisma/client";

// Eine einzige Instanz, auch bei Hot Reload im Dev-Modus.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
