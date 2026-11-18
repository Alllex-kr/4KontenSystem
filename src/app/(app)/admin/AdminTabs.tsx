"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, KeyRound, Layers, ScrollText, Users, UsersRound } from "lucide-react";

const TABS = [
  { href: "/admin", label: "Nutzer", icon: Users, exact: true },
  { href: "/admin/berechtigungen", label: "Berechtigungssätze", icon: KeyRound },
  { href: "/admin/satzgruppen", label: "Satzgruppen", icon: Layers },
  { href: "/admin/abos", label: "Abos", icon: CreditCard },
  { href: "/admin/gruppen", label: "Personengruppen", icon: UsersRound },
  { href: "/admin/protokoll", label: "Protokoll", icon: ScrollText },
];

export function AdminTabs() {
  const pathname = usePathname();
  const active = (t: (typeof TABS)[number]) =>
    t.exact ? pathname === t.href || pathname.startsWith("/admin/nutzer") : pathname.startsWith(t.href);
  return (
    <nav className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" aria-label="Adminbereich">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className="chip" aria-pressed={active(t)} aria-current={active(t) ? "page" : undefined}>
          <t.icon size={15} /> {t.label}
        </Link>
      ))}
    </nav>
  );
}
