import type { Metadata } from "next";
import { legalInfo } from "@/lib/legal";

// Angaben kommen zur Laufzeit aus der .env, nicht aus dem Build
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Impressum" };

const Missing = ({ name }: { name: string }) => <span className="text-bad">[{name} fehlt]</span>;

export default function ImpressumPage() {
  const i = legalInfo();
  return (
    <>
      <h1>Impressum</h1>

      <h2>Angaben gemäß § 5 DDG</h2>
      <p>
        {i.name || <Missing name="IMPRESSUM_NAME" />}
        <br />
        {i.street || <Missing name="IMPRESSUM_STREET" />}
        <br />
        {i.city || <Missing name="IMPRESSUM_CITY" />}
        <br />
        Deutschland
      </p>

      <h2>Kontakt</h2>
      <p>
        E-Mail: {i.email ? <a href={`mailto:${i.email}`}>{i.email}</a> : <Missing name="IMPRESSUM_EMAIL" />}
        {i.phone && (
          <>
            <br />
            Telefon: {i.phone}
          </>
        )}
      </p>

      <h2>Verbraucherstreitbeilegung</h2>
      <p>
        Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.
      </p>

      <h2>Haftung für Inhalte</h2>
      <p>
        FinanzKlee ist ein Werkzeug zur persönlichen Budgetplanung. Die Berechnungen und Hinweise in der App sind keine
        Finanz-, Steuer- oder Anlageberatung. Wir bemühen uns um korrekte Ergebnisse, übernehmen aber keine Gewähr für
        Richtigkeit und Vollständigkeit.
      </p>
    </>
  );
}
