"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import {
  ArrowLeftRight,
  CalendarClock,
  Eye,
  EyeOff,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Palette,
  Plus,
  Settings,
  ShieldCheck,
  Sun,
  Target,
  Upload,
  Vault,
  Wallet,
} from "lucide-react";
import { logout } from "@/actions/auth";
import { saveAppearance } from "@/actions/finance";
import { applyAppearance, type Appearance, type Theme } from "@/lib/appearance";
import { centerOf, markHydrated, themeTransition } from "@/lib/motion";
import type { AccountLite } from "@/lib/data";
import { Logo, LogoMark } from "./brand/Logo";
import { QuickAdd } from "./QuickAdd";
import { Sheet } from "./Sheet";
import { ToastProvider } from "./Toaster";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";
import { LanguageSwitcher } from "./LanguageSwitcher";

type NavItem = { href: string; label: string; short: string; icon: typeof Plus; perm?: string };

// perm = Berechtigung, ohne die der Eintrag ausgeblendet wird (Kernfunktionen haben keine)
const ALL_NAV: NavItem[] = [
  { href: "/dashboard", label: msg("Dashboard"), short: msg("Start"), icon: LayoutDashboard },
  { href: "/transaktionen", label: msg("Buchungen"), short: msg("Buchungen"), icon: ArrowLeftRight },
  { href: "/konten", label: msg("Konten"), short: msg("Konten"), icon: Wallet },
  { href: "/import", label: msg("CSV-Import"), short: msg("Import"), icon: Upload, perm: "import.csv" },
  { href: "/bankkonten", label: msg("Bankkonten"), short: msg("Bankkonten"), icon: Landmark, perm: "bank.connect" },
  { href: "/zahlungen", label: msg("Fixe Zahlungen"), short: msg("Fixkosten"), icon: CalendarClock },
  { href: "/ruecklagen", label: msg("Rücklagen"), short: msg("Rücklagen"), icon: Vault, perm: "reserves.use" },
  { href: "/ziele", label: msg("Sparziele"), short: msg("Ziele"), icon: Target, perm: "goals.use" },
  { href: "/anpassen", label: msg("Design & Anpassen"), short: msg("Design"), icon: Palette, perm: "customize.use" },
  { href: "/einstellungen", label: msg("Einstellungen"), short: msg("Einstellungen"), icon: Settings },
  { href: "/admin", label: msg("Admin"), short: msg("Admin"), icon: ShieldCheck, perm: "admin.access" },
];

const THEME_NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon };
const THEME_LABEL = { system: msg("Wie System"), light: msg("Hell"), dark: msg("Dunkel") };

export function AppShell({
  userName,
  permissions = [],
  language = null,
  accounts,
  appearance,
  children,
}: {
  userName: string;
  /** Effektive Berechtigungen des Nutzers */
  permissions?: string[];
  /** Gespeicherte Sprache (null = automatisch) */
  language?: string | null;
  accounts: AccountLite[];
  appearance: Appearance;
  children: React.ReactNode;
}) {
  const t = useT();
  const pathname = usePathname();
  const NAV = ALL_NAV.filter((n) => !n.perm || permissions.includes(n.perm));
  const [quickOpen, setQuickOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(appearance.theme);
  const [hidden, setHidden] = useState(appearance.hideAmounts);
  const [, startTransition] = useTransition();

  // Werte übernehmen, wenn sie woanders (Anpassen-Seite) geändert wurden
  useEffect(() => setTheme(appearance.theme), [appearance.theme]);
  useEffect(() => setHidden(appearance.hideAmounts), [appearance.hideAmounts]);

  // Shortcut aus dem App-Icon: /dashboard?schnell=1
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("schnell") === "1") setQuickOpen(true);
  }, []);

  // Erst nach dem ersten Seitenwechsel dürfen neu erscheinende Zahlen hochzählen.
  // Bewusst während des Renderns gesetzt: die neue Seite wird erst danach gerendert.
  const firstPath = useRef(pathname);
  if (pathname !== firstPath.current) markHydrated();

  // Gleitende Markierung in der Seitenleiste: Position des aktiven Links messen
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{ top: number; height: number; instant: boolean } | null>(null);
  useLayoutEffect(() => {
    const measure = (instant: boolean) => {
      const el = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
      // Seitenleiste ausgeblendet (Handy) → nichts anzeigen
      setIndicator((prev) => (el && el.offsetHeight > 0 ? { top: el.offsetTop, height: el.offsetHeight, instant: instant || !prev } : null));
    };
    measure(false);
    // Reagiert auch, wenn die Seitenleiste erst durch Vergrößern des Fensters sichtbar wird
    const ro = new ResizeObserver(() => measure(true));
    if (navRef.current) ro.observe(navRef.current);
    return () => ro.disconnect();
  }, [pathname]);

  const closeQuick = useCallback(() => setQuickOpen(false), []);
  const closeMore = useCallback(() => setMoreOpen(false), []);

  const cycleTheme = (e: React.MouseEvent) => {
    const next = THEME_NEXT[theme];
    setTheme(next);
    themeTransition(() => applyAppearance({ theme: next }), centerOf(e));
    startTransition(() => void saveAppearance({ theme: next }));
  };
  const togglePrivacy = () => {
    const next = !hidden;
    setHidden(next);
    applyAppearance({ hideAmounts: next });
    startTransition(() => void saveAppearance({ hideAmounts: next }));
  };

  const ThemeIcon = THEME_ICON[theme];
  const isActive = (href: string) => pathname.startsWith(href);
  const bottom = [NAV[0], NAV[1], null, NAV[2]] as const;
  const moreActive = NAV.slice(3).some((n) => isActive(n.href));
  // Spalte der unteren Leiste: 0 Start, 1 Buchungen, (2 = Plus), 3 Konten, 4 Mehr
  const bottomIndex = isActive("/dashboard") ? 0 : isActive("/transaktionen") ? 1 : isActive("/konten") ? 3 : moreActive ? 4 : -1;

  return (
    <ToastProvider>
    <div className="lg:flex">
      {/* ---------- Desktop-Seitenleiste ---------- */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-5 border-r border-line bg-surface p-4 lg:flex">
        <Link href="/dashboard" className="px-2 pt-1" aria-label={t("Zum Dashboard")}>
          <Logo size={34} tagline />
        </Link>
        <button onClick={() => setQuickOpen(true)} className="btn w-full">
          <Plus size={18} />{" "}{t("Schnell buchen")}
        </button>
        <nav ref={navRef} className="relative flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label={t("Hauptnavigation")}>
          <span
            aria-hidden
            className="nav-indicator pointer-events-none absolute inset-x-0 top-0 rounded-xl bg-accent-soft"
            style={{
              translate: `0 ${indicator?.top ?? 0}px`,
              height: indicator?.height ?? 0,
              opacity: indicator ? 1 : 0,
              transition: indicator?.instant ? "none" : undefined,
            }}
          />
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors duration-300 ${
                isActive(href) ? "text-accent" : "text-muted hover:bg-surface-2/70 hover:text-fg"
              }`}
            >
              <Icon size={19} className="transition-transform duration-300 ease-out group-hover:scale-110" />
              {t(label)}
            </Link>
          ))}
        </nav>
        <div className="space-y-1 border-t border-line pt-3">
          <div className="flex gap-1">
            <button onClick={cycleTheme} className="icon-btn flex-1 gap-2 text-xs font-semibold" title={t("Farbschema wechseln")}>
              <ThemeIcon size={17} /> {t(THEME_LABEL[theme])}
            </button>
            <button onClick={togglePrivacy} className="icon-btn" title={hidden ? t("Beträge anzeigen") : t("Beträge verbergen")} aria-pressed={hidden}>
              {hidden ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          <LanguageSwitcher saved={language} compact />
          <div className="flex items-center gap-2 px-2 pt-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-black text-accent">
              {userName.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{userName}</span>
            <form action={logout}>
              <button className="icon-btn" title={t("Abmelden")} aria-label={t("Abmelden")}>
                <LogOut size={17} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* ---------- Mobile Kopfzeile ---------- */}
      <header className="pt-safe sticky top-0 z-30 bg-surface/90 shadow-[0_1px_0_var(--line)] backdrop-blur-md lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/dashboard" aria-label={t("Zum Dashboard")}>
            <Logo size={28} />
          </Link>
          <div className="flex items-center">
            <button onClick={togglePrivacy} className="icon-btn" aria-label={hidden ? t("Beträge anzeigen") : t("Beträge verbergen")} aria-pressed={hidden}>
              {hidden ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
            <button onClick={cycleTheme} className="icon-btn" aria-label={t("Farbschema: {v0}", { v0: t(THEME_LABEL[theme]) })}>
              <ThemeIcon size={19} />
            </button>
          </div>
        </div>
      </header>

      <main className="pb-safe min-w-0 flex-1 px-4 pt-4 sm:px-6 sm:pt-6 lg:px-10 lg:pt-8 lg:pb-10">{children}</main>

      {/* ---------- Mobile Navigation unten ---------- */}
      <nav
        className="bottom-safe fixed inset-x-0 bottom-0 z-40 bg-surface/92 shadow-[0_-1px_0_var(--line)] backdrop-blur-md lg:hidden"
        aria-label={t("Hauptnavigation")}
      >
        <div className="relative mx-auto grid h-16 max-w-xl grid-cols-5 items-center px-2">
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-2 right-2">
            <span
              className="nav-indicator absolute top-[9px] flex w-1/5 justify-center"
              style={{ translate: `${Math.max(bottomIndex, 0) * 100}% 0`, opacity: bottomIndex >= 0 ? 1 : 0 }}
            >
              <span className="h-7 w-12 rounded-full bg-accent-soft" />
            </span>
          </div>
          {bottom.map((n, i) =>
            n === null ? (
              <div key="fab" className="flex justify-center">
                <button
                  onClick={() => setQuickOpen(true)}
                  className="fab -mt-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-lg shadow-black/20"
                  aria-label={t("Schnell buchen")}
                >
                  <Plus size={28} strokeWidth={2.6} />
                </button>
              </div>
            ) : (
              <BottomLink key={n.href} href={n.href} label={t(n.short)} icon={n.icon} active={isActive(n.href)} index={i} />
            ),
          )}
          <button
            onClick={() => setMoreOpen(true)}
            className={`relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors duration-300 ${moreActive ? "text-accent" : "text-muted"}`}
          >
            <span className="flex h-7 w-12 items-center justify-center">
              <Menu size={21} key={moreActive ? "a" : "i"} className={moreActive ? "animate-pop" : ""} />
            </span>
            {t("Mehr")}
          </button>
        </div>
      </nav>

      <Sheet open={quickOpen} onClose={closeQuick} title={t("Schnell buchen")}>
        <QuickAdd accounts={accounts} onDone={closeQuick} />
      </Sheet>

      <Sheet open={moreOpen} onClose={closeMore} title={t("Mehr")}>
        <div className="stagger grid grid-cols-2 gap-2">
          {NAV.slice(3).map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={closeMore}
              className={`flex min-h-20 flex-col justify-between rounded-2xl border p-3 text-sm font-bold transition ${
                isActive(href) ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-surface-2"
              }`}
            >
              <Icon size={22} />
              {t(label)}
            </Link>
          ))}
        </div>
        <LanguageSwitcher saved={language} className="mt-4" />
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
          <LogoMark size={28} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{userName}</span>
          <form action={logout}>
            <button className="btn-ghost"><LogOut size={16} />{" "}{t("Abmelden")}</button>
          </form>
        </div>
      </Sheet>
    </div>
    </ToastProvider>
  );
}

function BottomLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Plus; active: boolean; index: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors duration-300 ${active ? "text-accent" : "text-muted"}`}
    >
      <span className="flex h-7 w-12 items-center justify-center">
        {/* key wechselt beim Aktivieren: kleines "Pop" des Icons */}
        <Icon size={21} key={active ? "a" : "i"} className={active ? "animate-pop" : ""} />
      </span>
      {label}
    </Link>
  );
}
