import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Eigener Build-Ordner für einen zweiten Dev-Server (z. B. Tests neben deinem laufenden Server)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Projektordner explizit als Root setzen (im Benutzerordner liegt eine weitere package-lock.json).
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
