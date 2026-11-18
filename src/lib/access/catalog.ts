// Katalog aller Berechtigungen (ähnlich Salesforce):
//
//   Berechtigung  →  Berechtigungssatz  →  Satzgruppe  →  Abo / Personengruppe / Person
//
// Für jede Berechtigung legt Vierklee automatisch einen eigenen Berechtigungssatz an
// (eine Funktion = ein Satz). Zusammengehörige Sätze bündeln die Satzgruppen unten.
//
// Neue Funktion, die man freischalten können soll?
// 1. Hier in PERMISSIONS einen Schlüssel ergänzen. Der Satz dazu entsteht beim nächsten Start.
// 2. Im Code mit can(userId, "dein.schluessel") bzw. requirePermission(...) prüfen.
// 3. Im Adminbereich den Satz einer Satzgruppe (oder direkt Abo, Personengruppe, Person) geben.
// Solange ein Nutzer die Berechtigung nirgends hat, bleibt die Funktion gesperrt.

export type PermissionDef = { label: string; description: string; category: string };

export const PERMISSIONS = {
  "import.csv": {
    label: "CSV-Import",
    description: "Umsätze aus dem CSV-Export der Bank importieren, mit gelernten Zuordnungen.",
    category: "Daten",
  },
  "bank.connect": {
    label: "Bankanbindung",
    description: "Bankkonten verbinden und Umsätze automatisch abrufen.",
    category: "Daten",
  },
  "reserves.use": {
    label: "Rücklagen",
    description: "Rücklagen-Posten planen, Käufe dokumentieren und die Monatsrate berechnen.",
    category: "Planung",
  },
  "goals.use": {
    label: "Sparziele",
    description: "Sparziele anlegen und den Fortschritt verfolgen (auch als Dashboard-Widget).",
    category: "Planung",
  },
  "customize.use": {
    label: "Dashboard & Design anpassen",
    description: "Dashboard-Widgets anordnen, Vorlagen, Akzentfarbe und Kontofarben ändern.",
    category: "Personalisierung",
  },
  "ai.categorize": {
    label: "KI-Kategorisierung",
    description: "Claude ordnet beim CSV-Import und Bank-Sync Umsätze ohne Regel ein.",
    category: "KI",
  },
  "admin.access": {
    label: "Adminbereich öffnen",
    description: "Sieht den Adminbereich mit allen Nutzern, Abos und dem Protokoll.",
    category: "Administration",
  },
  "admin.users": {
    label: "Nutzer verwalten",
    description: "Ändert Abo, Gruppen und Berechtigungen von Nutzern, meldet sie ab oder sperrt sie.",
    category: "Administration",
  },
  "admin.access_control": {
    label: "Berechtigungen verwalten",
    description: "Legt Berechtigungssätze, Satzgruppen, Abos und Personengruppen an und ändert sie.",
    category: "Administration",
  },
} as const satisfies Record<string, PermissionDef>;

export type PermissionKey = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];
export const isPermissionKey = (k: string): k is PermissionKey => k in PERMISSIONS;
export const ADMIN_PERMISSIONS = PERMISSION_KEYS.filter((k) => k.startsWith("admin."));

/** Berechtigungen nach Kategorie gruppiert (für die Oberfläche). */
export function permissionsByCategory() {
  const groups = new Map<string, { key: PermissionKey; def: PermissionDef }[]>();
  for (const key of PERMISSION_KEYS) {
    const def: PermissionDef = PERMISSIONS[key];
    groups.set(def.category, [...(groups.get(def.category) ?? []), { key, def }]);
  }
  return [...groups.entries()];
}

/**
 * Funktionssätze: Schlüssel des Satzes = Schlüssel der Berechtigung.
 * Ihr Inhalt ist fest (genau diese eine Berechtigung), sie lassen sich nicht löschen.
 */
export const isFunctionSetKey = (key: string | null): key is PermissionKey => key != null && isPermissionKey(key);

/**
 * Vom System angelegte Satzgruppen. `plans` = in welche Abos die Gruppe beim ersten Anlegen kommt.
 * Danach entscheidest du im Adminbereich. "admin" ist geschützt (immer alle Admin-Sätze).
 */
export const SYSTEM_SET_GROUPS: { key: string; name: string; description: string; sets: PermissionKey[]; plans: string[]; locked?: boolean }[] = [
  { key: "data", name: "Daten-Import", description: "CSV-Import und Bankanbindung.", sets: ["import.csv", "bank.connect"], plans: ["free", "plus"] },
  { key: "planning", name: "Planung", description: "Rücklagen und Sparziele.", sets: ["reserves.use", "goals.use"], plans: ["free", "plus"] },
  { key: "personalize", name: "Personalisierung", description: "Dashboard und Design anpassen.", sets: ["customize.use"], plans: ["free", "plus"] },
  { key: "ai", name: "KI-Paket", description: "Alle Funktionen mit Claude.", sets: ["ai.categorize"], plans: ["plus"] },
  { key: "support", name: "Support", description: "Nutzer ansehen und verwalten, aber keine Abos oder Berechtigungen ändern.", sets: ["admin.access", "admin.users"], plans: [] },
  { key: "admin", name: "Admin-Rechte", description: "Voller Zugriff auf den Adminbereich (ohne die übrigen Funktionen).", sets: ADMIN_PERMISSIONS, plans: [], locked: true },
];

export const LOCKED_SET_GROUP_KEYS: readonly string[] = SYSTEM_SET_GROUPS.filter((g) => g.locked).map((g) => g.key);

/** Start-Abos. Werden nur angelegt, solange es noch gar keine Abos gibt. */
export const DEFAULT_PLANS = [
  { key: "free", name: "Kostenlos", description: "Das Vier-Konten-System ohne KI.", isDefault: true, sortOrder: 0 },
  { key: "plus", name: "Vierklee Plus", description: "Alles aus Kostenlos und dazu die KI-Funktionen.", isDefault: false, sortOrder: 1 },
];

/**
 * Abo "Administrator": Vollzugriff auf alle Funktionen, auch künftige. Nicht buchbar, nicht löschbar.
 * Nutzer aus ADMIN_EMAILS sind immer in diesem Abo.
 */
export const ADMIN_PLAN = {
  key: "admin",
  name: "Administrator",
  description: "Vollzugriff auf alle Funktionen und den Adminbereich, auch auf künftige Funktionen. Nicht buchbar.",
  sortOrder: 999,
};

/** Alte Systemsätze aus der ersten Version → werden in die gleichnamige Satzgruppe überführt. */
export const LEGACY_SET_KEYS = ["admin", "ai"] as const;
