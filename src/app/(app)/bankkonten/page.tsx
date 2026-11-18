import { requireUser } from "@/lib/auth";
import { getAccess } from "@/lib/access";
import { FeatureLocked } from "@/components/FeatureLocked";
import { prisma } from "@/lib/db";
import { loadAccountsLite } from "@/lib/data";
import { activeProviderInfo } from "@/lib/banking";
import { PageHeader } from "@/components/ui";
import { BankClient } from "./BankClient";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Bankkonten") };
}

export default async function BankkontenPage() {
  const t = await getT();
  const user = await requireUser();
  const access = await getAccess(user.id);
  if (!access.permissions.has("bank.connect")) return <FeatureLocked feature="bank.connect" planName={access.plan?.name} />;
  const [accounts, connections] = await Promise.all([
    loadAccountsLite(user.id),
    prisma.bankConnection.findMany({
      where: { userId: user.id },
      include: { accounts: { orderBy: { name: "asc" } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const info = activeProviderInfo();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Bankkonten verbinden")}
        subtitle={t("Optional: Kontostände und Umsätze direkt von deiner Bank holen, statt CSV-Dateien hochzuladen.")}
      />
      <BankClient
        provider={info}
        accounts={accounts}
        connections={connections.map((c) => ({
          id: c.id,
          provider: c.provider,
          bankName: c.bankName,
          status: c.status,
          lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
          lastError: c.lastError,
          createdAt: c.createdAt.toISOString(),
          accounts: c.accounts.map((a) => ({
            id: a.id,
            name: a.name,
            ibanMasked: a.ibanMasked,
            balanceCents: a.balanceCents,
            currency: a.currency,
            accountId: a.accountId,
            syncBalance: a.syncBalance,
          })),
        }))}
      />
    </div>
  );
}
