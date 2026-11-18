/** Gemeinsame Schnittstelle für Banking-Anbieter (Demo-Bank, finAPI, später weitere). */

export type ProviderId = "demo" | "finapi";

export interface ProviderAccount {
  externalId: string;
  name: string;
  iban: string | null;
  balanceCents: number | null;
  currency: string;
  type: string | null;
}

export interface ProviderTransaction {
  externalId: string;
  externalAccountId: string;
  date: string; // YYYY-MM-DD
  amountCents: number;
  payee: string;
  purpose: string;
}

export type ImportCheck =
  | { status: "pending"; message?: string }
  | { status: "completed"; externalConnectionId: string; bankName: string }
  | { status: "failed"; message: string };

export type UpdateCheck =
  | { status: "pending" }
  | { status: "completed" }
  | { status: "webform"; redirectUrl: string }
  | { status: "failed"; message: string };

/** Für wen und welche Verbindung gerade gearbeitet wird. */
export interface ProviderContext {
  userId: string;
  /** Lokale ID der BankConnection (für Rücksprung-URLs und die Demo-Bank) */
  connectionId: string;
}

export interface BankProvider {
  id: ProviderId;
  label: string;
  /** Testumgebung ohne echte Kontodaten? */
  sandbox: boolean;
  /** Startet die Verbindung. Der Nutzer wird zu redirectUrl geschickt (Web-Formular des Anbieters). */
  startImport(ctx: ProviderContext, opts: { returnUrl: string }): Promise<{ redirectUrl: string; pendingFormId: string }>;
  checkImport(ctx: ProviderContext, pendingFormId: string): Promise<ImportCheck>;
  /** Neue Umsätze bei der Bank abrufen lassen (ggf. mit erneuter Freigabe/SCA). */
  startUpdate(ctx: ProviderContext, externalConnectionId: string, opts: { returnUrl: string }): Promise<{ taskId: string }>;
  checkUpdate(ctx: ProviderContext, taskId: string, opts: { returnUrl: string }): Promise<UpdateCheck>;
  listAccounts(ctx: ProviderContext, externalConnectionId: string): Promise<ProviderAccount[]>;
  listTransactions(ctx: ProviderContext, externalAccountIds: string[], sinceIso: string): Promise<ProviderTransaction[]>;
  deleteConnection(ctx: ProviderContext, externalConnectionId: string): Promise<void>;
}

export function maskIban(iban: string | null | undefined): string | null {
  if (!iban) return null;
  const clean = iban.replace(/\s+/g, "");
  if (clean.length < 8) return clean;
  return `${clean.slice(0, 4)} •••• ${clean.slice(-4)}`;
}
