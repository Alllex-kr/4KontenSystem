import { ensureAccessSetup } from "./lib/access";

await ensureAccessSetup().catch((e) => console.error("[Zugriff] Einrichtung beim Start fehlgeschlagen:", e));
