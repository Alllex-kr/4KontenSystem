import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";
import { loadAccountsLite } from "@/lib/data";
import { prisma } from "@/lib/db";
import { normalizeAppearance } from "@/lib/appearance";
import { permissionKeys } from "@/lib/access";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [accounts, settings, permissions] = await Promise.all([
    loadAccountsLite(user.id),
    prisma.settings.findUnique({ where: { userId: user.id } }),
    permissionKeys(user.id),
  ]);
  return (
    <AppShell userName={user.name} permissions={permissions} language={settings?.language ?? null} accounts={accounts} appearance={normalizeAppearance(settings)}>
      {children}
    </AppShell>
  );
}
