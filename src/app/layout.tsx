import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { APPEARANCE_COOKIE, normalizeAppearance, parseAppearanceCookie } from "@/lib/appearance";
import { cookies } from "next/headers";
import { BRAND } from "@/lib/brand";
import { getLocale, getT } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { MESSAGES } from "@/lib/i18n/messages";
import "./globals.css";

const brandFont = Nunito({ subsets: ["latin"], variable: "--font-brand", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
  title: { default: `${BRAND.name} – ${t(BRAND.tagline)}`, template: `%s · ${BRAND.name}` },
  description: t(BRAND.description),
  applicationName: BRAND.name,
  icons: { icon: "/icon.svg", shortcut: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1310" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Darstellung serverseitig setzen, damit beim Laden nichts flackert.
  const user = await getCurrentUser();
  const settings = user ? await prisma.settings.findUnique({ where: { userId: user.id } }) : null;
  // Ohne Login: zuletzt auf diesem Gerät gewählte Darstellung (Cookie)
  const remembered = settings ? null : parseAppearanceCookie((await cookies()).get(APPEARANCE_COOKIE)?.value);
  const a = normalizeAppearance(settings ?? remembered);
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={brandFont.variable}
      data-theme={a.theme}
      data-accent={a.accent}
      data-font={a.fontScale}
      data-privacy={a.hideAmounts ? "on" : "off"}
      data-motion={a.motion}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="font-sans">
        <I18nProvider locale={locale} messages={MESSAGES[locale]}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
