import { prisma } from "../db";
import { can } from "../access";
import { aiAvailable, categorizeWithAi, estimateUsd, type AiItem } from "./categorize";
import type { Category } from "../constants";
import { msg } from "../i18n/translate";

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export async function getAiStatus(userId: string) {
  const [settings, usage, permitted] = await Promise.all([
    prisma.settings.findUnique({ where: { userId }, select: { aiCategorization: true, aiMonthlyLimit: true } }),
    prisma.aiUsage.findUnique({ where: { userId_month: { userId, month: monthKey() } } }),
    can(userId, "ai.categorize"),
  ]);
  const used = usage?.items ?? 0;
  const limit = settings?.aiMonthlyLimit ?? 1000;
  return {
    available: aiAvailable(),
    /** Berechtigung "ai.categorize" (über Abo, Gruppe oder direkt) */
    permitted,
    /** Eingeschaltet und erlaubt */
    enabled: permitted && Boolean(settings?.aiCategorization),
    limit,
    used,
    remaining: Math.max(0, limit - used),
    requests: usage?.requests ?? 0,
    estimatedUsd: estimateUsd(usage?.inputTokens ?? 0, usage?.outputTokens ?? 0),
  };
}

/**
 * Kategorisiert Umsätze per KI, wenn der Nutzer die Berechtigung hat, es eingeschaltet hat, ein API-Schlüssel da ist
 * und das Monatslimit reicht. Zählt den Verbrauch mit.
 */
export async function runAiCategorization(
  userId: string,
  items: AiItem[],
): Promise<{ categories: Map<string, Category>; error?: string; skippedByLimit: number }> {
  const status = await getAiStatus(userId);
  if (!status.enabled || !status.available || items.length === 0) return { categories: new Map(), skippedByLimit: 0 };
  const allowed = items.slice(0, status.remaining);
  const skipped = items.length - allowed.length;
  if (!allowed.length) return { categories: new Map(), skippedByLimit: skipped, error: msg("Dein monatliches KI-Limit ist erreicht.") };

  const r = await categorizeWithAi(allowed);
  if (r.requests > 0) {
    await prisma.aiUsage.upsert({
      where: { userId_month: { userId, month: monthKey() } },
      update: { items: { increment: r.sentItems }, requests: { increment: r.requests }, inputTokens: { increment: r.inputTokens }, outputTokens: { increment: r.outputTokens } },
      create: { userId, month: monthKey(), items: r.sentItems, requests: r.requests, inputTokens: r.inputTokens, outputTokens: r.outputTokens },
    });
  }
  return { categories: r.categories, error: r.error, skippedByLimit: skipped };
}
