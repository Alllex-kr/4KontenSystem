// Läuft einmal beim Serverstart: Abos, Funktionssätze und Satzgruppen anlegen,
// Konten aus ADMIN_EMAILS ins Abo "Administrator" setzen.
// Der Import steht im if, damit er nur im Node-Build landet (nicht für die Edge-Middleware).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
