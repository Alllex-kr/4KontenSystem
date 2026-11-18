import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Admin · Protokoll" };

export default async function AuditLogPage() {
  const entries = await prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const targetIds = [...new Set(entries.map((e) => e.targetUserId).filter((x): x is string => !!x))];
  const targets = new Map((await prisma.user.findMany({ where: { id: { in: targetIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  return (
    <div className="space-y-5">
      <PageHeader title="Protokoll" subtitle="Wer hat wann welche Rechte geändert. Die letzten 200 Einträge." />
      <Card>
        {entries.length === 0 ? (
          <EmptyState title="Noch nichts passiert" text="Sobald du Abos, Gruppen oder Berechtigungen änderst, steht es hier." />
        ) : (
          <ul className="divide-y divide-line">
            {entries.map((e) => (
              <li key={e.id} className="py-3 text-sm">
                <p>
                  <span className="font-bold">{e.action}</span>
                  {e.targetUserId && (
                    <>
                      {" · "}
                      <Link href={`/admin/nutzer/${e.targetUserId}`} className="font-semibold text-accent">
                        {targets.get(e.targetUserId) ?? "gelöschter Nutzer"}
                      </Link>
                    </>
                  )}
                </p>
                {e.detail && <p className="break-words text-muted">{e.detail}</p>}
                <p className="text-xs text-subtle">
                  {e.actorName} · {e.createdAt.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
