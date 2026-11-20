// Angaben für Impressum und Datenschutzerklärung.
// Sie stehen in der .env (nicht im Code), damit deine Adresse nicht im öffentlichen GitHub-Repo landet.

const env = (key: string) => process.env[key]?.trim() || "";

export function legalInfo() {
  const info = {
    /** Vor- und Nachname (bzw. Firmenname) */
    name: env("IMPRESSUM_NAME"),
    /** Straße und Hausnummer */
    street: env("IMPRESSUM_STREET"),
    /** PLZ und Ort */
    city: env("IMPRESSUM_CITY"),
    email: env("IMPRESSUM_EMAIL"),
    /** optional */
    phone: env("IMPRESSUM_PHONE"),
    /** Hoster des Servers, z. B. "Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen" */
    hoster: env("HOSTING_PROVIDER"),
  };
  const missing = [
    !info.name && "IMPRESSUM_NAME",
    !info.street && "IMPRESSUM_STREET",
    !info.city && "IMPRESSUM_CITY",
    !info.email && "IMPRESSUM_EMAIL",
    !info.hoster && "HOSTING_PROVIDER",
  ].filter((x): x is string => Boolean(x));
  return { ...info, missing };
}

/** Stand der Rechtstexte. Bei inhaltlichen Änderungen anpassen. */
export const LEGAL_UPDATED = "20.11.2026";
