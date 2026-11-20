import { AppShell } from "@/components/AppShell";
import { AccountNotices } from "@/components/AccountNotices";
import { requireUser } from "@/lib/auth";
import { loadAccountsLite } from "@/lib/data";
import { prisma } from "@/lib/db";
import { normalizeAppearance } from "@/lib/appearance";
import { permissionKeys } from "@/lib/access";
import { mailUsable } from "@/lib/mail";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [accounts, settings, permissions, account] = await Promise.all([
    loadAccountsLite(user.id),
    prisma.settings.findUnique({ where: { userId: user.id } }),
    permissionKeys(user.id),
    prisma.user.findUnique({ where: { id: user.id }, select: { emailVerifiedAt: true } }),
  ]);
  // Hinweis nur, wenn E-Mails überhaupt verschickt werden können
  const unverifiedEmail = mailUsable() && !account?.emailVerifiedAt ? user.email : null;
  return (
    <AppShell userName={user.name} permissions={permissions} language={settings?.language ?? null} accounts={accounts} appearance={normalizeAppearance(settings)}>
      <AccountNotices unverifiedEmail={unverifiedEmail} />
      {children}
    </AppShell>
  );
}
