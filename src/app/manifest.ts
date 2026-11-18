import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";
import { getLocale, getT } from "@/lib/i18n/server";

// Macht die Seite als App installierbar ("Zum Startbildschirm hinzufügen").
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getT();
  const locale = await getLocale();
  return {
    name: `${BRAND.name} – ${t(BRAND.claim)}`,
    short_name: BRAND.name,
    description: t(BRAND.description),
    start_url: "/dashboard",
    display: "standalone",
    orientation: "any",
    background_color: "#f6f8f5",
    theme_color: "#15803d",
    lang: locale,
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
    shortcuts: [
      { name: t("Ausgabe eintragen"), url: "/dashboard?schnell=1" },
      { name: t("Buchungen"), url: "/transaktionen" },
    ],
  };
}
