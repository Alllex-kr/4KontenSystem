import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing, LayoutGrid, Lock, Smartphone } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { ACCOUNT_KINDS, ACCOUNT_META } from "@/lib/constants";
import { BRAND } from "@/lib/brand";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { getT } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { rich } from "@/lib/i18n/rich";

const LEAF_TEXT: Record<(typeof ACCOUNT_KINDS)[number], { emoji: string; text: string }> = {
  FIXKOSTEN: { emoji: "🏠", text: msg("Miete, Handy, Semesterbeitrag. Läuft automatisch, ohne dass du daran denken musst.") },
  SPAREN: { emoji: "🌱", text: msg("Für Auslandssemester, Laptop oder den ersten ETF. Wächst jeden Monat ein bisschen.") },
  NOTGROSCHEN: { emoji: "🛟", text: msg("Kaputtes Fahrrad? Nachzahlung? Kein Drama, dafür ist er da.") },
  FREIZEIT: { emoji: "🎉", text: msg("Pizza, Konzert, Shopping. Alles, was hier liegt, darfst du ohne schlechtes Gewissen ausgeben.") },
};

export default async function Home() {
  const t = await getT();
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <div className="min-h-dvh overflow-x-clip">
      <header className="pt-safe sticky top-0 z-30 bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo size={32} />
          <nav className="flex items-center gap-2">
            <LanguageSwitcher compact className="w-36 max-sm:w-[4.5rem]" />
            <Link href="/login" className="btn-ghost">{t("Anmelden")}</Link>
            <Link href="/register" className="btn hidden sm:inline-flex">{t("Kostenlos starten")}</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-6 sm:px-6 md:grid-cols-2 md:pt-12">
          <div className="stagger">
            <p className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-sm font-bold text-accent">
              🍀 {BRAND.claim}
            </p>
            <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
              {rich(t("Glück ist <green>planbar.</green>"), { green: (x) => <span style={{ color: "var(--brand-green)" }}>{x}</span> })}
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              {t("Vierklee teilt dein Geld auf vier Konten auf. So weißt du jederzeit, was du ausgeben darfst, ob die Miete gedeckt ist und wann du dein Sparziel erreichst.")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="btn px-6 py-3 text-base">{t("Jetzt kostenlos starten")}</Link>
              <Link href="/login" className="btn-ghost px-6 py-3 text-base">{t("Ich habe schon ein Konto")}</Link>
            </div>
            <p className="mt-4 text-sm text-muted">{t("Kein Bankzugang nötig · Läuft auf Handy, Tablet und Laptop")}</p>
          </div>

          <div className="relative mx-auto aspect-square w-full max-w-md">
            <div className="absolute inset-[12%] rounded-full blur-3xl" style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--brand-green) 35%, transparent), transparent 70%)" }} />
            <div className="leaf-spin bloom relative flex h-full items-center justify-center">
              <LogoMark size={300} className="drop-shadow-xl" />
            </div>
            {ACCOUNT_KINDS.map((k, i) => {
              const pos = ["left-0 top-6", "right-0 top-10", "right-2 bottom-8", "left-2 bottom-4"][i];
              return (
                <div key={k} className={`card animate-float absolute ${pos} flex items-center gap-2 px-3 py-2 text-sm font-bold`} style={{ animationDelay: `${i * -1.5}s` }}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: ACCOUNT_META[k].color }} />
                  {t(ACCOUNT_META[k].short)}
                </div>
              );
            })}
          </div>
        </section>

        {/* Vier Blätter */}
        <section className="bg-surface py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-3xl font-black tracking-tight">{t("Vier Blätter. Vier Konten. Ein Plan.")}</h2>
            <p className="mt-2 max-w-2xl text-muted">{t("Jedes Blatt im Logo steht für ein Konto. Zusammen ergeben sie dein Glücksklee.")}</p>
            <div className="stagger mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ACCOUNT_KINDS.map((k) => (
                <div key={k} className="card-interactive rounded-2xl border border-line p-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl" style={{ background: `color-mix(in srgb, ${ACCOUNT_META[k].color} 16%, transparent)` }}>
                    {LEAF_TEXT[k].emoji}
                  </div>
                  <h3 className="mt-4 font-black" style={{ color: ACCOUNT_META[k].color }}>{t(ACCOUNT_META[k].label)}</h3>
                  <p className="mt-1 text-sm text-muted">{t(LEAF_TEXT[k].text)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="stagger grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: LayoutGrid, title: t("Dein Dashboard"), text: t("Widgets verschieben, vergrößern, ausblenden. Genau so, wie du es magst.") },
              { icon: BellRing, title: t("Frühwarnung"), text: t("Vierklee warnt dich, bevor dein Konto unter den Mindestpuffer rutscht.") },
              { icon: Smartphone, title: t("Für unterwegs"), text: t("Ausgabe in 3 Sekunden buchen. Als App auf dem Homescreen, auch auf Foldables.") },
              { icon: Lock, title: t("Deine Daten"), text: t("Kein Bankzugang nötig. Beträge auf Knopfdruck verbergen.") },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title}>
                <Icon className="text-accent" size={26} />
                <h3 className="mt-3 font-black">{title}</h3>
                <p className="mt-1 text-sm text-muted">{text}</p>
              </div>
            ))}
          </div>
          <div className="mt-14 flex flex-col items-center rounded-3xl bg-accent px-6 py-12 text-center text-accent-fg">
            <LogoMark size={56} />
            <h2 className="mt-4 text-3xl font-black">{t("Bereit für mehr Glück mit Geld?")}</h2>
            <p className="mt-2 max-w-md opacity-90">{t("In zwei Minuten eingerichtet. Mit Beispieldaten kannst du alles sofort ausprobieren.")}</p>
            <Link href="/register" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-white px-6 font-black text-[#15803d] transition duration-300 ease-[var(--ease-spring)] hover:scale-105 active:scale-95">
              {t("Kostenlos starten")}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 text-sm text-muted sm:px-6">
          <Logo size={22} />
          <span>{BRAND.tagline} · © {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
