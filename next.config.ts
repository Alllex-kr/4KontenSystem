import type { NextConfig } from "next";
import path from "node:path";

const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy: Der Browser lädt nur Inhalte von der eigenen Domain.
// 'unsafe-inline' braucht Next.js für seine eingebetteten Skripte; 'unsafe-eval' nur im Dev-Modus (Hot Reload).
// form-action erlaubt die Weiterleitungen zur Google-Anmeldung und zum Bank-Formular von finAPI.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "form-action 'self' https://accounts.google.com https://*.finapi.io",
  "base-uri 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Nicht in fremden Seiten einbetten (Schutz vor Clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // Nur über HTTPS: Der Browser merkt sich das für 1 Jahr. Lokal (http://localhost) nicht setzen.
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Für das Docker-Image: baut einen schlanken Server (server.js) mit nur den nötigen Paketen
  output: "standalone",
  // Eigener Build-Ordner für einen zweiten Dev-Server (z. B. Tests neben deinem laufenden Server)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Projektordner explizit als Root setzen (im Benutzerordner liegt eine weitere package-lock.json).
  outputFileTracingRoot: path.join(__dirname),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
