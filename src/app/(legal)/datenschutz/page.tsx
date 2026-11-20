import type { Metadata } from "next";
import { LEGAL_UPDATED, legalInfo } from "@/lib/legal";
import { googleEnabled } from "@/lib/oauth/google";
import { activeProviderInfo } from "@/lib/banking";
import { aiAvailable } from "@/lib/ai/categorize";

// Welche Abschnitte erscheinen, hängt von der Server-Konfiguration ab (Google, finAPI, KI)
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Datenschutzerklärung" };

export default function DatenschutzPage() {
  const i = legalInfo();
  const google = googleEnabled();
  const finapi = activeProviderInfo().id === "finapi";
  const ai = aiAvailable();
  // Abschnitte 1–7 sind fest, danach wird je nach Konfiguration weitergezählt
  let section = 7;
  const next = () => ++section;

  return (
    <>
      <h1>Datenschutzerklärung</h1>
      <p className="text-sm text-muted">Stand: {LEGAL_UPDATED}</p>

      <h2>1. Verantwortlicher</h2>
      <p>
        {i.name || "[Name fehlt]"}, {i.street || "[Straße fehlt]"}, {i.city || "[Ort fehlt]"}
        <br />
        E-Mail: {i.email ? <a href={`mailto:${i.email}`}>{i.email}</a> : "[E-Mail fehlt]"}
      </p>

      <h2>2. Das Wichtigste in Kürze</h2>
      <ul>
        <li>Wir verarbeiten nur die Daten, die für FinanzKlee nötig sind: dein Konto und die Finanzdaten, die du selbst einträgst oder importierst.</li>
        <li>Wir verkaufen keine Daten, zeigen keine Werbung und nutzen keine Tracking- oder Analyse-Dienste.</li>
        <li>Wir setzen nur technisch notwendige Cookies, deshalb gibt es kein Cookie-Banner.</li>
        <li>Du kannst jederzeit Auskunft verlangen und dein Konto löschen lassen.</li>
      </ul>

      <h2>3. Hosting und Server-Protokolle</h2>
      <p>
        FinanzKlee läuft auf einem Server von {i.hoster || "[Hoster fehlt]"}. Beim Aufruf der Seite verarbeitet der Server
        technisch notwendige Daten: IP-Adresse, Datum und Uhrzeit, aufgerufene Adresse, Browser-Kennung und übertragene
        Datenmenge. Das ist nötig, um die Seite auszuliefern und den Betrieb abzusichern (Art. 6 Abs. 1 lit. f DSGVO).
        Server-Protokolle werden nach spätestens 14 Tagen gelöscht. Mit dem Hoster besteht ein Vertrag zur
        Auftragsverarbeitung (Art. 28 DSGVO).
      </p>
      <p>Die Verbindung ist per TLS (HTTPS) verschlüsselt.</p>

      <h2>4. Dein Konto</h2>
      <p>
        Für die Registrierung speichern wir Name, E-Mail-Adresse und dein Passwort. Das Passwort liegt nur als
        sicherer Hash (bcrypt) vor, wir können es nicht lesen. Außerdem speichern wir, wann du dich registriert hast und
        wann du zuletzt aktiv warst. Rechtsgrundlage ist die Erfüllung des Nutzungsvertrags (Art. 6 Abs. 1 lit. b DSGVO).
      </p>

      <h2>5. Deine Finanzdaten</h2>
      <p>
        Alles, was du in FinanzKlee anlegst, wird gespeichert, damit die App funktioniert: Konten und Kontostände,
        feste Zahlungen, Buchungen, Sparziele, Rücklagen, Import-Regeln und Einstellungen. Bei einem CSV-Import liest
        der Server die Datei aus und speichert nur die übernommenen Buchungen, nicht die Datei selbst. Diese Daten
        nutzen wir ausschließlich, um dir die App bereitzustellen (Art. 6 Abs. 1 lit. b DSGVO). Wir werten sie nicht für
        andere Zwecke aus und geben sie nicht weiter, außer an die unten genannten Dienste, wenn du sie nutzt.
      </p>

      <h2>6. Cookies</h2>
      <p>
        Wir setzen nur Cookies, die für die von dir gewünschten Funktionen technisch notwendig sind
        (§ 25 Abs. 2 Nr. 2 TDDDG). Eine Einwilligung ist dafür nicht erforderlich.
      </p>
      <ul>
        <li><code>vks_session</code>: hält dich angemeldet, bis zu 30 Tage oder bis zum Abmelden.</li>
        <li><code>vk_lang</code>: merkt sich die gewählte Sprache, bis zu 1 Jahr.</li>
        <li><code>vk_appearance</code>: merkt sich die Darstellung (hell/dunkel, Farbe, Schriftgröße), bis zu 1 Jahr.</li>
        {google && <li><code>vk_oauth_google</code>: sichert die Anmeldung mit Google ab, wird nach wenigen Minuten gelöscht.</li>}
      </ul>

      <h2>7. Schutz vor Missbrauch</h2>
      <p>
        Damit niemand massenhaft Passwörter ausprobieren kann, zählen wir Anmelde- und Registrierungsversuche pro
        IP-Adresse und E-Mail-Adresse. Diese Zähler liegen nur im Arbeitsspeicher und verfallen nach 15 bis 60 Minuten
        (Art. 6 Abs. 1 lit. f DSGVO; berechtigtes Interesse: Sicherheit der Konten).
      </p>

      {google && (
        <>
          <h2>{next()}. Anmeldung mit Google</h2>
          <p>
            Wenn du „Mit Google fortfahren“ wählst, wirst du zu Google weitergeleitet (Google Ireland Limited, Gordon House,
            Barrow Street, Dublin 4, Irland). Nach deiner Zustimmung übermittelt Google uns deinen Namen, deine
            E-Mail-Adresse und eine Google-Kennung. Wir erhalten kein Google-Passwort. Rechtsgrundlage ist Art. 6 Abs. 1
            lit. b DSGVO. Google kann Daten auch in die USA übermitteln; Google ist nach dem EU-US Data Privacy Framework
            zertifiziert. Details:{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">policies.google.com/privacy</a>.
          </p>
        </>
      )}

      {finapi && (
        <>
          <h2>{next()}. Bankanbindung über finAPI</h2>
          <p>
            Wenn du ein Bankkonto verbindest, läuft das über die finAPI GmbH, Adams-Lehmann-Str. 44, 80797 München, einen
            von der BaFin zugelassenen Kontoinformationsdienst. Deine Bank-Zugangsdaten gibst du direkt im Formular von
            finAPI ein, sie erreichen unseren Server nie. Wir erhalten die Kontonamen, Kontostände und Umsätze der
            Konten, die du freigibst. Die Zugangsschlüssel zu finAPI speichern wir verschlüsselt. Rechtsgrundlage ist
            Art. 6 Abs. 1 lit. b DSGVO. Du kannst die Verbindung jederzeit in der App trennen. Details findest du in der
            Datenschutzerklärung auf <a href="https://www.finapi.io" target="_blank" rel="noreferrer">finapi.io</a>.
          </p>
        </>
      )}

      {ai && (
        <>
          <h2>{next()}. KI-Kategorisierung (nur wenn du sie einschaltest)</h2>
          <p>
            Die automatische Kategorisierung ist ausgeschaltet, bis du sie in den Einstellungen selbst einschaltest. Dann
            senden wir für noch nicht kategorisierte Buchungen den Empfänger, einen gekürzten Verwendungszweck und den Betrag
            an Anthropic (Anthropic, PBC, San Francisco, USA), um eine passende Kategorie vorzuschlagen. Vorher entfernen
            wir IBANs, E-Mail-Adressen und lange Nummern. Name und E-Mail-Adresse deines Kontos werden nicht übermittelt.
            Anthropic verwendet die Daten nicht zum Training seiner Modelle. Rechtsgrundlage ist deine Einwilligung
            (Art. 6 Abs. 1 lit. a DSGVO), die du jederzeit durch Ausschalten widerrufen kannst. Die Übermittlung in die USA
            erfolgt auf Grundlage von EU-Standardvertragsklauseln (Art. 46 DSGVO).
          </p>
        </>
      )}

      <h2>{next()}. Speicherdauer</h2>
      <p>
        Deine Daten speichern wir, solange dein Konto besteht. Wenn du dein Konto löschen lässt, löschen wir alle
        zugehörigen Daten. In Sicherungskopien (Backups) bleiben sie höchstens 14 Tage erhalten, bis die Kopie
        automatisch überschrieben wird. Änderungen, die Administratoren an Konten vornehmen, werden zur Nachvollziehbarkeit
        protokolliert.
      </p>

      <h2>{next()}. Deine Rechte</h2>
      <p>Du hast nach der DSGVO das Recht auf</p>
      <ul>
        <li>Auskunft über deine gespeicherten Daten (Art. 15),</li>
        <li>Berichtigung falscher Daten (Art. 16),</li>
        <li>Löschung deiner Daten (Art. 17),</li>
        <li>Einschränkung der Verarbeitung (Art. 18),</li>
        <li>Datenübertragbarkeit (Art. 20),</li>
        <li>Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21),</li>
        <li>Widerruf einer Einwilligung mit Wirkung für die Zukunft (Art. 7 Abs. 3).</li>
      </ul>
      <p>
        Schreib uns dafür einfach eine E-Mail{i.email && <> an <a href={`mailto:${i.email}`}>{i.email}</a></>}. Außerdem
        kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel bei der Behörde deines
        Bundeslandes.
      </p>

      <h2>{next()}. Keine automatisierten Entscheidungen</h2>
      <p>
        Es findet keine automatisierte Entscheidungsfindung oder Profilbildung im Sinne von Art. 22 DSGVO statt.
        Vorschläge der App (zum Beispiel Kategorien oder Sparraten) kannst du jederzeit ändern.
      </p>
    </>
  );
}
