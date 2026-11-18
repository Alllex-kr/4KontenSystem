"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/access";
import { runAiCategorization } from "@/lib/ai/usage";
import type { Category } from "@/lib/constants";
import type { ActionState } from "./types";
import { getT } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";

const rowsSchema = z
  .array(z.object({ id: z.string().max(40), payee: z.string().max(300), purpose: z.string().max(500), amountCents: z.number().int() }))
  .max(3000);

/** CSV-Import: Umsätze ohne passende Regel von Claude einordnen lassen. */
export async function aiCategorizeRows(rows: z.input<typeof rowsSchema>): Promise<{ categories: Record<string, Category>; error?: string; skippedByLimit?: number }> {
  const t = await getT();
  const user = await requireUser();
  if (!(await can(user.id, "ai.categorize"))) return { categories: {}, error: t("Die KI-Funktionen sind in deinem Abo nicht enthalten.") };
  const parsed = rowsSchema.safeParse(rows);
  if (!parsed.success) return { categories: {}, error: t("Ungültige Daten.") };
  const r = await runAiCategorization(user.id, parsed.data);
  revalidatePath("/einstellungen");
  return { categories: Object.fromEntries(r.categories), error: r.error, skippedByLimit: r.skippedByLimit };
}

export async function saveAiSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getT();
  const user = await requireUser();
  if (!(await can(user.id, "ai.categorize"))) return { error: t("Die KI-Funktionen sind in deinem Abo nicht enthalten.") };
  const parsed = z
    .object({
      aiCategorization: z.literal("on").optional(),
      aiMonthlyLimit: z.coerce.number().int().min(0, msg("Limit 0–10.000")).max(10000, msg("Limit 0–10.000")),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t(parsed.error.issues[0]?.message ?? "Ungültige Eingabe.") };
  await prisma.settings.update({
    where: { userId: user.id },
    data: { aiCategorization: parsed.data.aiCategorization === "on", aiMonthlyLimit: parsed.data.aiMonthlyLimit },
  });
  revalidatePath("/", "layout");
  return { success: parsed.data.aiCategorization === "on" ? t("KI-Kategorisierung ist eingeschaltet.") : t("KI-Kategorisierung ist ausgeschaltet.") };
}
