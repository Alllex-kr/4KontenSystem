import Link from "next/link";
import { Trash2, Upload } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadOverview } from "@/lib/data";
import { ACCOUNT_KINDS, CATEGORIES, CATEGORY_COLORS, type AccountKind } from "@/lib/constants";
import { formatCents, formatDate, intlLocale } from "@/lib/format";
import { addTransaction, deleteTransactionUndoable, restoreTransactions } from "@/actions/finance";
import { UndoDelete } from "@/components/UndoDelete";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { BarsChart, DonutChart, Legendary } from "@/components/charts";
import { getT } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/rich";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Buchungen") };
}

export default async function TransaktionenPage({ searchParams }: { searchParams: Promise<{ konto?: string; monat?: string }> }) {
  const t = await getT();
  const user = await requireUser();
  const { konto, monat } = await searchParams;
  const { accounts, colors, names } = await loadOverview(user.id);

  const now = new Date();
  const valid = monat && /^\d{4}-(0[1-9]|1[0-2])$/.test(monat);
  const [y, m] = valid ? monat.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 1);
  const filterAccount = accounts.find((a) => a.kind === konto);

  const txs = await prisma.transaction.findMany({
    where: { userId: user.id, date: { gte: from, lt: to }, ...(filterAccount ? { accountId: filterAccount.id } : {}) },
    include: { account: { select: { name: true, kind: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  const real = txs.filter((item) => !item.transferGroup);
  const income = real.filter((item) => item.amountCents > 0).reduce((s, item) => s + item.amountCents, 0);
  const expense = -real.filter((item) => item.amountCents < 0).reduce((s, item) => s + item.amountCents, 0);

  const cat = new Map<string, number>();
  for (const item of real) if (item.amountCents < 0) cat.set(item.category, (cat.get(item.category) ?? 0) - item.amountCents);
  const catSlices = [...cat.entries()].sort((a, b) => b[1] - a[1]).map(([name, v], i) => ({ name, value: v / 100, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));

  // Ausgaben pro Tag im Monat, gestapelt nach Konto
  const daysIn = new Date(y, m, 0).getDate();
  const daily = Array.from({ length: daysIn }, (_, i) => {
    const row: Record<string, number | string> = { label: String(i + 1) };
    for (const k of ACCOUNT_KINDS) row[k] = 0;
    return row;
  });
  for (const item of real) {
    if (item.amountCents >= 0) continue;
    const r = daily[item.date.getDate() - 1];
    r[item.account.kind] = (r[item.account.kind] as number) - item.amountCents / 100;
  }

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { v: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, l: d.toLocaleDateString(intlLocale(), { month: "long", year: "numeric" }) };
  });
  const currentMonth = `${y}-${String(m).padStart(2, "0")}`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Nach Tag gruppieren (übersichtlicher auf dem Handy)
  const groups = new Map<string, typeof txs>();
  for (const item of txs) {
    const key = item.date.toLocaleDateString(intlLocale(), { weekday: "long", day: "numeric", month: "long" });
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("Buchungen")} subtitle={t("Trag spontane Ausgaben ein, vor allem vom Freizeitkonto. So weißt du immer, wie viel noch übrig ist.")}>
        <Link href="/import" className="btn-ghost"><Upload size={16} />{" "}{t("CSV importieren")}</Link>
      </PageHeader>

      <form className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <select name="monat" defaultValue={currentMonth} className="input sm:w-auto" aria-label={t("Monat")}>
          {monthOptions.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
        <select name="konto" defaultValue={konto ?? ""} className="input sm:w-auto" aria-label={t("Konto")}>
          <option value="">{t("Alle Konten")}</option>
          {ACCOUNT_KINDS.map((k) => <option key={k} value={k}>{names[k]}</option>)}
        </select>
        <button className="btn-ghost col-span-2 sm:col-span-1">{t("Filtern")}</button>
      </form>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Stat label={t("Einnahmen")} cents={income} tone="good" />
        <Stat label={t("Ausgaben")} cents={expense} tone="bad" />
        <Stat label={t("Saldo")} cents={income - expense} tone={income - expense >= 0 ? "good" : "bad"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title={t("Liste")} subtitle={t("{length} Buchungen", { length: txs.length })} className="xl:col-span-2">
          {txs.length === 0 ? (
            <EmptyState title={t("Keine Buchungen in diesem Zeitraum")} text={t("Tippe auf + oder nutze das Formular, um eine Ausgabe einzutragen.")} />
          ) : (
            <div className="stagger space-y-5">
              {[...groups.entries()].map(([day, items]) => (
                <section key={day}>
                  <h3 className="sticky top-[calc(3.5rem+var(--safe-top))] z-10 -mx-1 bg-surface px-1 py-1 text-xs font-black uppercase tracking-wide text-muted lg:top-0">{day}</h3>
                  <ul className="divide-y divide-line">
                    {items.map((item) => (
                      <li key={item.id} className="flex items-center gap-3 rounded-lg py-2.5 transition-colors hover:bg-surface-2/60">
                        <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: colors[item.account.kind as AccountKind] }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold">{item.description}</p>
                          <p className="truncate text-xs text-muted">{names[item.account.kind as AccountKind]} · {t(item.category)}{item.transferGroup ? t(" · Umbuchung") : ""}{item.affectsBalance ? "" : t(" · vor Abgleich")}</p>
                        </div>
                        <span className={`tabular shrink-0 font-black ${item.amountCents < 0 ? "text-bad" : "text-good"}`}>{formatCents(item.amountCents)}</span>
                        <UndoDelete
                          onDelete={deleteTransactionUndoable.bind(null, item.id)}
                          onRestore={restoreTransactions}
                          message={item.transferGroup ? t("Umbuchung gelöscht") : t("Buchung gelöscht")}
                          label={item.transferGroup ? t("Umbuchung (beide Seiten) löschen") : t("{description} löschen", { description: item.description })}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-muted">
            {rich(t("Beim Löschen wird der Betrag dem Konto wieder gutgeschrieben bzw. abgezogen, und du kannst es einige Sekunden lang rückgängig machen. Buchungen vor deinem letzten Kontoabgleich ändern den Kontostand nicht, weil sie dort schon enthalten sind. Umbuchungen machst du unter <link>Konten</link>."), { link: (x) => <Link href="/konten" className="underline">{x}</Link> })}
          </p>
        </Card>

        <div className="space-y-6">
          <Card title={t("Neue Buchung")} subtitle={t("Mit Datum und allen Kategorien")}>
            <ActionForm action={addTransaction} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="sm:col-span-2 xl:col-span-1">
                <label className="label" htmlFor="description">{t("Beschreibung")}</label>
                <input id="description" name="description" className="input" placeholder={t("z. B. Pizza, Kino, Wocheneinkauf")} />
              </div>
              <div>
                <label className="label" htmlFor="amount">{t("Betrag (€)")}</label>
                <input id="amount" name="amount" className="input tabular" placeholder="12,50" inputMode="decimal" required />
              </div>
              <div>
                <label className="label" htmlFor="direction">{t("Art")}</label>
                <select id="direction" name="direction" className="input">
                  <option value="OUT">{t("Ausgabe")}</option>
                  <option value="IN">{t("Einnahme")}</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="accountId">{t("Konto")}</label>
                <select id="accountId" name="accountId" className="input" defaultValue={accounts.find((a) => a.kind === "FREIZEIT")?.id}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="category">{t("Kategorie")}</label>
                <select id="category" name="category" className="input" defaultValue="Freizeit">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="date">{t("Datum")}</label>
                <input id="date" name="date" type="date" className="input" defaultValue={today} required />
              </div>
              <div className="flex items-end">
                <SubmitButton className="btn w-full">{t("Buchen")}</SubmitButton>
              </div>
            </ActionForm>
          </Card>
          <Card title={t("Nach Kategorie")}>
            <DonutChart data={catSlices} centerLabel={t("Ausgaben")} centerValue={formatCents(expense)} />
            <Legendary data={catSlices.slice(0, 6)} />
          </Card>
        </div>
      </div>

      <Card title={t("Ausgaben pro Tag")} subtitle={t("Nach Konto gestapelt")}>
        <BarsChart data={daily} stacked series={ACCOUNT_KINDS.map((k) => ({ key: k, name: names[k], color: colors[k] }))} />
      </Card>
    </div>
  );
}
