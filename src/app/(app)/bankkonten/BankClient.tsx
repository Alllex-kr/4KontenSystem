"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, FlaskConical, KeyRound, Landmark, Link2, Lock, RefreshCw, ShieldCheck, Trash2, Upload } from "lucide-react";
import { disconnectBank, startBankConnection, syncBankConnection, updateBankLink } from "@/actions/banking";
import { ACCOUNT_META, type AccountKind } from "@/lib/constants";
import { formatCents } from "@/lib/format";
import type { AccountLite } from "@/lib/data";
import { Alert, Card, EmptyState } from "@/components/ui";

type Conn = {
  id: string;
  provider: string;
  bankName: string;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  accounts: { id: string; name: string; ibanMasked: string | null; balanceCents: number | null; currency: string; accountId: string | null; syncBalance: boolean }[];
};

const STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Verbunden", cls: "bg-good/10 text-good" },
  PENDING: { label: "Nicht abgeschlossen", cls: "bg-warn/10 text-warn" },
  NEEDS_REAUTH: { label: "Freigabe erneuern", cls: "bg-warn/10 text-warn" },
  ERROR: { label: "Fehler", cls: "bg-bad/10 text-bad" },
};

const fmtDate = (iso: string) => new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function BankClient({
  provider,
  accounts,
  connections,
}: {
  provider: { id: string; label: string; sandbox: boolean; problem: string | null };
  accounts: AccountLite[];
  connections: Conn[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "good" | "warn"; text: string } | null>(null);
  const [, start] = useTransition();

  const go = (url: string) => {
    if (url.startsWith("/")) router.push(url);
    else window.location.assign(url);
  };

  const connect = () => {
    setBusy("connect");
    setNotice(null);
    start(async () => {
      const res = await startBankConnection();
      if (res.error) {
        setNotice({ tone: "warn", text: res.error });
        setBusy(null);
      } else if (res.redirectUrl) go(res.redirectUrl);
    });
  };

  const sync = (id: string) => {
    setBusy(`sync-${id}`);
    setNotice(null);
    start(async () => {
      const res = await syncBankConnection(id);
      setBusy(null);
      if (res.redirectUrl) {
        setNotice({ tone: "warn", text: res.message ?? "Weiterleitung zur Bank …" });
        go(res.redirectUrl);
      } else if (res.error) setNotice({ tone: "warn", text: res.error });
      else setNotice({ tone: "good", text: res.message ?? "Synchronisiert." });
      router.refresh();
    });
  };

  const disconnect = (c: Conn) => {
    if (!confirm(`Verbindung zu „${c.bankName}“ trennen? Bereits übernommene Umsätze bleiben erhalten.`)) return;
    setBusy(`del-${c.id}`);
    start(async () => {
      const res = await disconnectBank(c.id);
      setBusy(null);
      setNotice({ tone: res.error ? "warn" : "good", text: res.error ?? res.message ?? "Getrennt." });
      router.refresh();
    });
  };

  const active = connections.filter((c) => c.status !== "PENDING");
  const pending = connections.filter((c) => c.status === "PENDING");

  return (
    <div className="space-y-6">
      {/* Modus */}
      {provider.id === "demo" ? (
        <Alert tone="info">
          <FlaskConical size={16} className="mr-2 inline" />
          <b>Demo-Modus:</b> Du verbindest eine erfundene Demo-Bank, um den Ablauf auszuprobieren. Für echte Konten trägst du finAPI-Zugangsdaten in die{" "}
          <code>.env</code> ein (Anleitung: <code>docs/BANKANBINDUNG.md</code>).
        </Alert>
      ) : provider.problem ? (
        <Alert><AlertTriangle size={16} className="mr-2 inline" />finAPI ist ausgewählt, aber nicht vollständig eingerichtet. {provider.problem}</Alert>
      ) : provider.sandbox ? (
        <Alert tone="info">
          <FlaskConical size={16} className="mr-2 inline" />
          <b>finAPI Sandbox:</b> Testumgebung von finAPI. Verwende die Testbanken von finAPI, keine echten Bankdaten.
        </Alert>
      ) : null}

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent"><Landmark size={28} /></span>
            <div className="flex-1">
              <h2 className="text-lg font-black">Bank verbinden</h2>
              <p className="text-sm text-muted">
                Du wirst zu {provider.id === "demo" ? "der Demo-Bank" : "finAPI"} weitergeleitet, wählst deine Bank und bestätigst den Zugriff wie gewohnt (z. B. mit pushTAN). Danach kommst du hierher zurück.
              </p>
            </div>
            <button onClick={connect} disabled={busy === "connect" || Boolean(provider.problem)} className="btn shrink-0">
              <Link2 size={17} /> {busy === "connect" ? "Weiterleiten …" : "Bank verbinden"}
            </button>
          </div>
        </Card>
        <Card title="Sicher verbunden">
          <ul className="space-y-2.5 text-sm text-muted">
            <li className="flex gap-2"><KeyRound size={17} className="mt-0.5 shrink-0 text-good" /> Deine Bank-Zugangsdaten gibst du nur bei der Bank bzw. dem lizenzierten Anbieter ein. Vierklee sieht sie nie.</li>
            <li className="flex gap-2"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-good" /> Nur Lesezugriff: Kontostand und Umsätze. Überweisungen sind nicht möglich.</li>
            <li className="flex gap-2"><Lock size={17} className="mt-0.5 shrink-0 text-good" /> Du kannst die Verbindung jederzeit trennen.</li>
          </ul>
        </Card>
      </div>

      {active.length === 0 ? (
        <EmptyState icon={<Landmark size={40} />} title="Noch keine Bank verbunden" text="Lieber ohne Bankzugang? Der CSV-Import funktioniert genauso gut.">
          <Link href="/import" className="btn-ghost"><Upload size={16} /> CSV importieren</Link>
        </EmptyState>
      ) : (
        active.map((c) => (
          <Card
            key={c.id}
            title={c.bankName}
            subtitle={`${c.provider === "demo" ? "Demo-Bank" : "über finAPI"} · ${c.lastSyncAt ? `zuletzt synchronisiert ${fmtDate(c.lastSyncAt)}` : "noch nicht synchronisiert"}`}
            action={<span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${STATUS[c.status]?.cls ?? ""}`}>{STATUS[c.status]?.label ?? c.status}</span>}
          >
            {c.lastError && <div className="mb-4"><Alert>{c.lastError}</Alert></div>}
            <p className="mb-2 text-sm font-semibold">Welches Bankkonto gehört zu welchem Vierklee-Konto?</p>
            <ul className="divide-y divide-line">
              {c.accounts.map((l) => (
                <LinkRow key={l.id} link={l} accounts={accounts} />
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => sync(c.id)} disabled={busy !== null} className="btn">
                <RefreshCw size={17} className={busy === `sync-${c.id}` ? "animate-spin" : ""} /> {busy === `sync-${c.id}` ? "Synchronisiere …" : c.status === "NEEDS_REAUTH" ? "Freigabe erneuern" : "Jetzt synchronisieren"}
              </button>
              <button onClick={() => disconnect(c)} disabled={busy !== null} className="btn-ghost hover:text-bad">
                <Trash2 size={16} /> Trennen
              </button>
            </div>
            <p className="mt-3 text-xs text-muted">
              Banken verlangen spätestens alle 90 bis 180 Tage eine erneute Bestätigung. Vierklee sagt dir dann Bescheid.
            </p>
          </Card>
        ))
      )}

      {pending.length > 0 && (
        <Card title="Nicht abgeschlossene Verbindungen" subtitle="Hier wurde die Freigabe bei der Bank nicht beendet.">
          <ul className="divide-y divide-line text-sm">
            {pending.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="flex-1">Gestartet am {fmtDate(c.createdAt)}</span>
                <Link href={`/bankkonten/zurueck?c=${c.id}`} className="btn-ghost">Status prüfen</Link>
                <button onClick={() => disconnect(c)} className="icon-btn hover:bg-bad/10 hover:text-bad" aria-label="Entfernen"><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function LinkRow({ link, accounts }: { link: Conn["accounts"][number]; accounts: AccountLite[] }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(link.accountId ?? "");
  const [syncBalance, setSyncBalance] = useState(link.syncBalance);
  const [saved, setSaved] = useState(false);
  const [, start] = useTransition();

  const save = (next: { accountId: string; syncBalance: boolean }) =>
    start(async () => {
      const res = await updateBankLink({ linkId: link.id, accountId: next.accountId || null, syncBalance: next.syncBalance });
      if (!res.error) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
        router.refresh();
      }
    });

  const target = accounts.find((a) => a.id === accountId);
  return (
    <li className="grid gap-3 py-3 sm:grid-cols-[1fr_14rem] sm:items-center">
      <div className="min-w-0">
        <p className="truncate font-bold">{link.name}</p>
        <p className="text-xs text-muted">
          {link.ibanMasked ?? "ohne IBAN"} · Stand bei der Bank: <span className="tabular font-bold text-fg">{link.balanceCents != null ? formatCents(link.balanceCents) : "–"}</span>
        </p>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          {target && <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: target.color }} />}
          <select
            className="input"
            value={accountId}
            aria-label={`Vierklee-Konto für ${link.name}`}
            onChange={(e) => {
              setAccountId(e.target.value);
              save({ accountId: e.target.value, syncBalance });
            }}
          >
            <option value="">Nicht synchronisieren</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name === ACCOUNT_META[a.kind as AccountKind].label ? ACCOUNT_META[a.kind as AccountKind].short : a.name}</option>
            ))}
          </select>
          {saved && <CheckCircle2 size={18} className="shrink-0 text-good" aria-label="Gespeichert" />}
        </div>
        {accountId && (
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={syncBalance}
              onChange={(e) => {
                setSyncBalance(e.target.checked);
                save({ accountId, syncBalance: e.target.checked });
              }}
            />
            Kontostand von der Bank übernehmen
          </label>
        )}
      </div>
    </li>
  );
}
