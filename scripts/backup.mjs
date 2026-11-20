// Sicherung der SQLite-Datenbank: npm run backup
//
// Erstellt mit "VACUUM INTO" eine vollständige, in sich stimmige Kopie, auch während die App läuft.
// Die Kopie wird gepackt (.db.gz) und landet in BACKUP_DIR (Standard: ./backups).
// Sicherungen älter als BACKUP_KEEP_DAYS (Standard: 14) werden gelöscht.
//
// Auf dem Server täglich per cron ausführen, siehe docs/BETRIEB.md.

import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { PrismaClient } from "@prisma/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
if (existsSync(".env")) process.loadEnvFile?.(".env");

const backupDir = resolve(process.env.BACKUP_DIR || "backups");
const keepDays = Number(process.env.BACKUP_KEEP_DAYS || 14);

const url = process.env.DATABASE_URL || "";
if (!url.startsWith("file:")) {
  console.error(`DATABASE_URL ist keine SQLite-Datei ("${url}"). Dieses Skript sichert nur SQLite.`);
  process.exit(1);
}

mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
const raw = join(backupDir, `finanzklee-${stamp}.db`);
const packed = `${raw}.gz`;

const prisma = new PrismaClient();
try {
  // VACUUM INTO erwartet einen String-Literal; der Pfad stammt von uns, einfache Anführungszeichen werden verdoppelt.
  await prisma.$executeRawUnsafe(`VACUUM INTO '${raw.replace(/'/g, "''")}'`);
} catch (e) {
  console.error("Sicherung fehlgeschlagen:", e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}

await pipeline(createReadStream(raw), createGzip({ level: 9 }), createWriteStream(packed));
rmSync(raw);
console.log(`Gesichert: ${packed} (${(statSync(packed).size / 1024).toFixed(0)} KB)`);

// Alte Sicherungen aufräumen
const cutoff = Date.now() - keepDays * 86_400_000;
let removed = 0;
for (const name of readdirSync(backupDir)) {
  if (!/^finanzklee-.*\.db\.gz$/.test(name)) continue;
  const p = join(backupDir, name);
  if (statSync(p).mtimeMs < cutoff) {
    rmSync(p);
    removed++;
  }
}
if (removed) console.log(`${removed} Sicherung(en) älter als ${keepDays} Tage gelöscht.`);
