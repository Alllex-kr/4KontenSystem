import { prisma } from "../db";
import { decryptSecret, encryptSecret, hasEncryptionKey, randomToken } from "./crypto";
import { demoProvider } from "./demo";
import { createFinapiProvider } from "./finapi";
import type { BankProvider, ProviderId } from "./types";

export * from "./types";

/** Welcher Anbieter ist aktiv? finAPI nur, wenn Zugangsdaten und Schlüssel in der .env stehen. */
export function activeProviderInfo(): { id: ProviderId; label: string; sandbox: boolean; problem: string | null } {
  const wanted = (process.env.BANKING_PROVIDER ?? (process.env.FINAPI_CLIENT_ID ? "finapi" : "demo")).toLowerCase();
  if (wanted !== "finapi") return { id: "demo", label: "Demo-Bank", sandbox: true, problem: null };
  const missing = [
    !process.env.FINAPI_CLIENT_ID && "FINAPI_CLIENT_ID",
    !process.env.FINAPI_CLIENT_SECRET && "FINAPI_CLIENT_SECRET",
    !hasEncryptionKey() && "BANKING_ENCRYPTION_KEY",
  ].filter(Boolean);
  const live = process.env.FINAPI_ENV === "live";
  return {
    id: "finapi",
    label: live ? "finAPI" : "finAPI Sandbox",
    sandbox: !live,
    problem: missing.length ? `In der .env fehlt: ${missing.join(", ")}` : null,
  };
}

let finapi: BankProvider | null = null;

export function getProvider(id: ProviderId): BankProvider {
  if (id === "demo") return demoProvider;
  const info = activeProviderInfo();
  if (info.problem) throw new Error(info.problem);
  finapi ??= createFinapiProvider({
    clientId: process.env.FINAPI_CLIENT_ID!,
    clientSecret: process.env.FINAPI_CLIENT_SECRET!,
    env: process.env.FINAPI_ENV === "live" ? "live" : "sandbox",
    newUserId: () => `vk${randomToken(22)}`,
    newPassword: () => randomToken(32),
    store: {
      async get(userId) {
        const row = await prisma.providerIdentity.findUnique({ where: { userId_provider: { userId, provider: "finapi" } } });
        return row ? { externalUserId: row.externalUserId, secret: decryptSecret(row.secretEnc) } : null;
      },
      async save(userId, externalUserId, secret) {
        await prisma.providerIdentity.create({ data: { userId, provider: "finapi", externalUserId, secretEnc: encryptSecret(secret) } });
      },
    },
  });
  return finapi;
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
