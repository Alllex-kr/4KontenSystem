import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/access";
import { prisma } from "@/lib/db";
import { DEMO_ACCOUNTS } from "@/lib/banking/demo";
import { DemoBankClient } from "./DemoBankClient";

export const metadata = { title: "Demo-Bank" };

export default async function DemoBankPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await requirePermission("bank.connect");
  const { c } = await searchParams;
  const conn = c ? await prisma.bankConnection.findFirst({ where: { id: c, userId: user.id, provider: "demo" } }) : null;
  if (!conn) notFound();
  return <DemoBankClient connectionId={conn.id} accounts={DEMO_ACCOUNTS(conn.id).map((a) => a.name)} />;
}
