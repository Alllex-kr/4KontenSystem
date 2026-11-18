import { requirePermission } from "@/lib/access";
import { ReturnClient } from "./ReturnClient";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Bank wird verbunden") };
}

export default async function ZurueckPage({ searchParams }: { searchParams: Promise<{ c?: string; sync?: string }> }) {
  await requirePermission("bank.connect");
  const { c, sync } = await searchParams;
  return <ReturnClient connectionId={c ?? ""} afterSync={sync === "1"} />;
}
