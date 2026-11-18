import { requirePermission } from "@/lib/access";
import { AdminTabs } from "./AdminTabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("admin.access");
  return (
    <div className="max-w-5xl">
      <AdminTabs />
      {children}
    </div>
  );
}
