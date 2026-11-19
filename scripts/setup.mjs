// Einrichtung nach dem Klonen: `npm run setup`
// 1. legt die .env aus .env.example an (falls sie fehlt)
// 2. erstellt bzw. aktualisiert die SQLite-Datenbank (prisma/dev.db)
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

if (!/^\s*DATABASE_URL\s*=/m.test(readFileSync(env, "utf8"))) {
  console.error('✗ In der .env fehlt DATABASE_URL. Trag zum Beispiel ein: DATABASE_URL="file:./dev.db"');
  process.exit(1);
}

console.log("… Datenbank wird eingerichtet");
execSync("npx prisma db push", { cwd: root, stdio: "inherit" });

console.log(`
✓ Fertig. Starten mit:  npm run dev   →  http://localhost:3000

Tipp: Damit dein Konto Administrator wird, trag deine E-Mail in der .env ein:
      ADMIN_EMAILS="deine@mail.de"   (danach Server neu starten)
`);
