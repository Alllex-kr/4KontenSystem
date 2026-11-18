import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

// Macht die Seite als App installierbar ("Zum Startbildschirm hinzufügen").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} – ${BRAND.claim}`,
    short_name: BRAND.name,
    description: BRAND.description,
    start_url: "/dashboard",
    display: "standalone",
    orientation: "any",
    background_color: "#f6f8f5",
    theme_color: "#15803d",
    lang: "de",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
    shortcuts: [
      { name: "Ausgabe eintragen", url: "/dashboard?schnell=1" },
      { name: "Buchungen", url: "/transaktionen" },
    ],
  };
}
