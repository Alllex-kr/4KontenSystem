import { getT } from "@/lib/i18n/server";
/** Lade-Skelett: erscheint sofort beim Seitenwechsel, bis die Daten da sind. */
export default async function Loading() {
  const t = await getT();
  return (
    <div className="space-y-5" aria-busy="true" aria-label={t("Seite lädt")}>
      <div className="space-y-2">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-8 w-64 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card space-y-3">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-7 w-28" />
            <div className="skeleton h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="card space-y-4 xl:col-span-2">
          <div className="skeleton h-4 w-40" />
          <div className="skeleton h-56 w-full" />
        </div>
        <div className="card space-y-4">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton mx-auto h-40 w-40 rounded-full" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-4/5" />
        </div>
      </div>
    </div>
  );
}
