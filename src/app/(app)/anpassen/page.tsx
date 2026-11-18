import { requireUser } from "@/lib/auth";
import { getAccess } from "@/lib/access";
import { FeatureLocked } from "@/components/FeatureLocked";
import { loadAccountsLite } from "@/lib/data";
import { prisma } from "@/lib/db";
import { normalizeAppearance } from "@/lib/appearance";
import { PageHeader } from "@/components/ui";
import { AnpassenClient } from "./AnpassenClient";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Design & Anpassen") };
}

export default async function AnpassenPage() {
  const t = await getT();
  const user = await requireUser();
  const access = await getAccess(user.id);
  if (!access.permissions.has("customize.use")) return <FeatureLocked feature="customize.use" planName={access.plan?.name} />;
  const [accounts, settings] = await Promise.all([loadAccountsLite(user.id), prisma.settings.findUnique({ where: { userId: user.id } })]);
  return (
    <div className="max-w-4xl">
      <PageHeader title={t("Design & Anpassen")} subtitle={t("Mach FinanzKlee zu deinem Tool. Änderungen werden sofort übernommen und automatisch gespeichert.")} />
      <AnpassenClient appearance={normalizeAppearance(settings)} accounts={accounts} />
    </div>
  );
}
