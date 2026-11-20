// Einrichtung nach dem Klonen: `npm run setup`
// 1. legt die .env aus .env.example an (falls sie fehlt)
// 2. spielt die Datenbank-Migrationen in die lokale PostgreSQL-Datenbank ein
// Voraussetzung: Die Datenbank läuft (npm run db:start, braucht Docker Desktop).
// Läuft auf Windows, macOS und Linux. Mehrfach ausführen ist unschädlich.
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = join(root, ".env");
const example = join(root, ".env.example");

const [major] = process.versions.node.split(".").map(Number);
if (major < 20) {
  console.error(`✗ Node.js ${process.versions.node} ist zu alt. Bitte Node.js 20 oder neuer installieren (https://nodejs.org).`);
  process.exit(1);
}

if (!existsSync(env)) {
  copyFileSync(example, env);
  console.log("✓ .env aus .env.example angelegt");
} else {
  console.log("✓ .env ist schon da");
}

const url = readFileSync(env, "utf8").match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]*)/m)?.[1] ?? "";
if (!url) {
  console.error('✗ In der .env fehlt DATABASE_URL. Trag ein: DATABASE_URL="postgresql://finanzklee:finanzklee@localhost:5432/finanzklee"');
  process.exit(1);
}
if (url.startsWith("file:")) {
  console.error(`✗ DATABASE_URL zeigt noch auf SQLite (${url}). FinanzKlee nutzt jetzt PostgreSQL.
  Ändere die Zeile in der .env zu:
  DATABASE_URL="postgresql://finanzklee:finanzklee@localhost:5432/finanzklee"`);
  process.exit(1);
}

console.log("… Datenbank-Migrationen werden eingespielt");
try {
  execSync("npx prisma migrate deploy", { cwd: root, stdio: "inherit" });
} catch {
  console.error(`
✗ Die Datenbank ist nicht erreichbar. Läuft sie?
  Starten mit:  npm run db:start   (braucht Docker Desktop: https://www.docker.com/products/docker-desktop/)`);
  process.exit(1);
}

console.log(`
✓ Fertig. Starten mit:  npm run dev   →  http://localhost:3000

Tipp: Damit dein Konto Administrator wird, trag deine E-Mail in der .env ein:
      ADMIN_EMAILS="deine@mail.de"   (danach Server neu starten)
`);
