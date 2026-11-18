"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, FlaskConical, KeyRound, Landmark, Link2, Lock, RefreshCw, ShieldCheck, Trash2, Upload } from "lucide-react";
import { disconnectBank, startBankConnection, syncBankConnection, updateBankLink } from "@/actions/banking";
import { ACCOUNT_META, shortAccountName, type AccountKind } from "@/lib/constants";
import { formatCents, intlLocale } from "@/lib/format";
import type { AccountLite } from "@/lib/data";
import { Alert, Card, EmptyState } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";
import { rich } from "@/lib/i18n/rich";

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
  ACTIVE: { label: msg("Verbunden"), cls: "bg-good/10 text-good" },
  PENDING: { label: msg("Nicht abgeschlossen"), cls: "bg-warn/10 text-warn" },
  NEEDS_REAUTH: { label: msg("Freigabe erneuern"), cls: "bg-warn/10 text-warn" },
  ERROR: { label: msg("Fehler"), cls: "bg-bad/10 text-bad" },
};

const fmtDate = (iso: string) => new Date(iso).toLocaleString(intlLocale(), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function BankClient({
  provider,
  accounts,
  connections,
}: {
  provider: { id: string; label: string; sandbox: boolean; problem: string | null };
  accounts: AccountLite[];
  connections: Conn[];
}) {
  const t = useT();
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
        setNotice({ tone: "warn", text: res.message ?? t("Weiterleitung zur Bank …") });
        go(res.redirectUrl);
      } else if (res.error) setNotice({ tone: "warn", text: res.error });
      else setNotice({ tone: "good", text: res.message ?? t("Synchronisiert.") });
      router.refresh();
    });
  };

  const disconnect = (c: Conn) => {
    if (!confirm(t("Verbindung zu „{bank}“ trennen? Bereits übernommene Umsätze bleiben erhalten.", { bank: c.bankName }))) return;
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
          {rich(t("<b>Demo-Modus:</b> Du verbindest eine erfundene Demo-Bank, um den Ablauf auszuprobieren. Für echte Konten trägst du finAPI-Zugangsdaten in die <code>.env</code> ein (Anleitung: <code>docs/BANKANBINDUNG.md</code>)."), {
            b: (x) => <b>{x}</b>,
            code: (x) => <code>{x}</code>,
          })}
        </Alert>
      ) : provider.problem ? (
        <Alert><AlertTriangle size={16} className="mr-2 inline" />{t("finAPI ist ausgewählt, aber nicht vollständig eingerichtet.")}{" "}{provider.problem}</Alert>
      ) : provider.sandbox ? (
        <Alert tone="info">
          <FlaskConical size={16} className="mr-2 inline" />
          <b>{t("finAPI Sandbox:")}</b>{" "}{t("Testumgebung von finAPI. Verwende die Testbanken von finAPI, keine echten Bankdaten.")}
        </Alert>
      ) : null}

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent"><Landmark size={28} /></span>
            <div className="flex-1">
              <h2 className="text-lg font-black">{t("Bank verbinden")}</h2>
              <p className="text-sm text-muted">
                {provider.id === "demo" ? t("Du wirst zur Demo-Bank weitergeleitet, wählst deine Bank und bestätigst den Zugriff wie gewohnt (z. B. mit pushTAN). Danach kommst du hierher zurück.") : t("Du wirst zu finAPI weitergeleitet, wählst deine Bank und bestätigst den Zugriff wie gewohnt (z. B. mit pushTAN). Danach kommst du hierher zurück.")}
              </p>
            </div>
            <button onClick={connect} disabled={busy === "connect" || Boolean(provider.problem)} className="btn shrink-0">
              <Link2 size={17} /> {busy === "connect" ? t("Weiterleiten …") : t("Bank verbinden")}
            </button>
          </div>
        </Card>
        <Card title={t("Sicher verbunden")}>
          <ul className="space-y-2.5 text-sm text-muted">
            <li className="flex gap-2"><KeyRound size={17} className="mt-0.5 shrink-0 text-good" />{" "}{t("Deine Bank-Zugangsdaten gibst du nur bei der Bank bzw. dem lizenzierten Anbieter ein. FinanzKlee sieht sie nie.")}</li>
            <li className="flex gap-2"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-good" />{" "}{t("Nur Lesezugriff: Kontostand und Umsätze. Überweisungen sind nicht möglich.")}</li>
            <li className="flex gap-2"><Lock size={17} className="mt-0.5 shrink-0 text-good" />{" "}{t("Du kannst die Verbindung jederzeit trennen.")}</li>
          </ul>
        </Card>
      </div>

      {active.length === 0 ? (
        <EmptyState icon={<Landmark size={40} />} title={t("Noch keine Bank verbunden")} text={t("Lieber ohne Bankzugang? Der CSV-Import funktioniert genauso gut.")}>
          <Link href="/import" className="btn-ghost"><Upload size={16} />{" "}{t("CSV importieren")}</Link>
        </EmptyState>
      ) : (
        active.map((c) => (
          <Card
            key={c.id}
            title={c.bankName}
            subtitle={`${c.provider === "demo" ? t("Demo-Bank") : t("über finAPI")} · ${c.lastSyncAt ? t("zuletzt synchronisiert {date}", { date: fmtDate(c.lastSyncAt) }) : t("noch nicht synchronisiert")}`}
            action={<span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${STATUS[c.status]?.cls ?? ""}`}>{STATUS[c.status] ? t(STATUS[c.status].label) : c.status}</span>}
          >
            {c.lastError && <div className="mb-4"><Alert>{c.lastError}</Alert></div>}
            <p className="mb-2 text-sm font-semibold">{t("Welches Bankkonto gehört zu welchem FinanzKlee-Konto?")}</p>
            <ul className="divide-y divide-line">
              {c.accounts.map((l) => (
                <LinkRow key={l.id} link={l} accounts={accounts} />
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => sync(c.id)} disabled={busy !== null} className="btn">
                <RefreshCw size={17} className={busy === `sync-${c.id}` ? "animate-spin" : ""} /> {busy === `sync-${c.id}` ? t("Synchronisiere …") : c.status === "NEEDS_REAUTH" ? t("Freigabe erneuern") : t("Jetzt synchronisieren")}
              </button>
              <button onClick={() => disconnect(c)} disabled={busy !== null} className="btn-ghost hover:text-bad">
                <Trash2 size={16} />{" "}{t("Trennen")}
              </button>
            </div>
            <p className="mt-3 text-xs text-muted">
              {t("Banken verlangen spätestens alle 90 bis 180 Tage eine erneute Bestätigung. FinanzKlee sagt dir dann Bescheid.")}
            </p>
          </Card>
        ))
      )}

      {pending.length > 0 && (
        <Card title={t("Nicht abgeschlossene Verbindungen")} subtitle={t("Hier wurde die Freigabe bei der Bank nicht beendet.")}>
          <ul className="divide-y divide-line text-sm">
            {pending.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="flex-1">{t("Gestartet am")}{" "}{fmtDate(c.createdAt)}</span>
                <Link href={`/bankkonten/zurueck?c=${c.id}`} className="btn-ghost">{t("Status prüfen")}</Link>
                <button onClick={() => disconnect(c)} className="icon-btn hover:bg-bad/10 hover:text-bad" aria-label={t("Entfernen")}><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function LinkRow({ link, accounts }: { link: Conn["accounts"][number]; accounts: AccountLite[] }) {
  const t = useT();
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
          {link.ibanMasked ?? t("ohne IBAN")} · {t("Stand bei der Bank:")}{" "}<span className="tabular font-bold text-fg">{link.balanceCents != null ? formatCents(link.balanceCents) : "–"}</span>
        </p>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          {target && <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: target.color }} />}
          <select
            className="input"
            value={accountId}
            aria-label={t("FinanzKlee-Konto für {name}", { name: link.name })}
            onChange={(e) => {
              setAccountId(e.target.value);
              save({ accountId: e.target.value, syncBalance });
            }}
          >
            <option value="">{t("Nicht synchronisieren")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{shortAccountName(a.name, a.kind as AccountKind, t)}</option>
            ))}
          </select>
          {saved && <CheckCircle2 size={18} className="shrink-0 text-good" aria-label={t("Gespeichert")} />}
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
            {t("Kontostand von der Bank übernehmen")}
          </label>
        )}
      </div>
    </li>
  );
}
