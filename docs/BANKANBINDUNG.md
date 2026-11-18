# Bankanbindung (optional)

FinanzKlee kann Kontostände und Umsätze direkt von der Bank holen. Das läuft über einen **lizenzierten Kontoinformationsdienst** nach PSD2. Vorbereitet ist **finAPI**, der Code ist aber so aufgebaut, dass sich später andere Anbieter (Tink, Enable Banking, …) ergänzen lassen (`src/lib/banking/types.ts`).

Ohne Zugangsdaten läuft eine **Demo-Bank**: Freigabe, Kontozuordnung und Synchronisierung funktionieren mit erfundenen Daten.

## So funktioniert es

1. Der Nutzer klickt unter **Bankkonten** auf **Bank verbinden**.
2. FinanzKlee legt bei finAPI einen technischen Benutzer an. Dessen zufälliges Passwort wird **AES-256-GCM-verschlüsselt** gespeichert (`ProviderIdentity`).
3. Der Nutzer wird zum **finAPI Web Form** weitergeleitet, wählt seine Bank und meldet sich **dort** an (inkl. SCA, z. B. pushTAN). FinanzKlee sieht die Bank-Zugangsdaten nie.
4. Zurück in FinanzKlee (`/bankkonten/zurueck`) werden die Konten geladen. Das erste Girokonto wird dem Fixkostenkonto zugeordnet, alles andere ordnet der Nutzer selbst zu.
5. **Jetzt synchronisieren** stößt ein Update bei der Bank an (`/api/tasks/backgroundUpdate`). Verlangt die Bank eine neue Freigabe, wird der Nutzer erneut zum Web Form geschickt. Danach werden Salden übernommen und neue Umsätze kategorisiert importiert (beim ersten Mal 90 Tage). Duplikate werden über die Umsatz-ID der Bank erkannt.

## finAPI-Sandbox einrichten

1. Sandbox-Zugang bei finAPI anfragen: <https://www.finapi.io/jetzt-testen/> (laut finAPI 30 Tage kostenlos). Du bekommst `client_id` und `client_secret`.
2. Schlüssel für die Verschlüsselung erzeugen:
   ```bash
   openssl rand -base64 32
   ```
3. In die `.env` eintragen (Vorlage: `.env.example`):
   ```env
   BANKING_PROVIDER="finapi"
   FINAPI_ENV="sandbox"
   FINAPI_CLIENT_ID="…"
   FINAPI_CLIENT_SECRET="…"
   BANKING_ENCRYPTION_KEY="…"
   APP_URL="http://localhost:3000"
   ```
4. Dev-Server neu starten, unter **Bankkonten** auf **Bank verbinden** klicken und im Web Form eine **finAPI-Testbank** wählen (z. B. BLZ `DEMO0001` oder `DEMO0002`). Die Zugangsdaten der finAPI-Demobank (BLZ `99990000`) gibt es laut Doku nur über finAPI.

> **Wichtig:** Den `BANKING_ENCRYPTION_KEY` nie ändern oder verlieren, sonst können die gespeicherten finAPI-Benutzer nicht mehr entschlüsselt werden. Nie in Git einchecken.

## Was geprüft ist und was noch nicht

| Teil | Status |
| --- | --- |
| Web Form 2.0: Formular anlegen, Status abfragen, `payload.bankConnectionId`, Update-Task, Rücksprung-Parameter | anhand der offiziellen OpenAPI-Datei geprüft |
| OAuth-Token, User anlegen, `GET /api/v2/bankConnections/{id}`, `GET /api/v2/accounts` | laut Doku |
| Token-Pfad `/api/v2/oauth/token` (mit Fallback `/oauth/token`), `POST /api/v2/users`, `GET /api/v2/transactions` und dessen Parameter, `DELETE /api/v2/bankConnections/{id}`, Feldnamen von Konten und Umsätzen | **nicht bestätigt**: Die Access-Spezifikation war nicht abrufbar. Der Code fängt fehlende Felder ab. Bitte einmal mit der Sandbox durchtesten. |
| Gesamter Ablauf | mit der Demo-Bank im Browser getestet, finAPI-Client mit nachgebauten Antworten (Unit-Tests) |

Auf `localhost` (http) sendet FinanzKlee die Rücksprung-Adresse als URL-Parameter am Web Form mit. finAPI verlangt für `redirectUrl` im Request HTTPS. Klappt der automatische Rücksprung lokal nicht, öffne einfach wieder FinanzKlee: unter **Bankkonten → Nicht abgeschlossene Verbindungen → Status prüfen** geht es weiter.

## Bevor echte Nutzer echte Konten verbinden

- **Lizenz/Vertrag:** Für den Live-Betrieb ist ein Lizenzvertrag mit finAPI nötig (bzw. mit einem anderen lizenzierten Anbieter). Ohne eigene BaFin-Lizenz arbeitet FinanzKlee unter der Lizenz des Anbieters, die Bedingungen klärt der Vertrag.
- **Kosten:** Anbieter rechnen meist pro verbundenem Nutzer ab. Preise beim Anbieter anfragen.
- **Datenschutz (DSGVO):** Datenschutzerklärung, Auftragsverarbeitungsvertrag mit dem Anbieter, Hosting in der EU, Löschkonzept (Trennen löscht die Verbindung beim Anbieter, importierte Umsätze bleiben in FinanzKlee).
- **Sicherheit:** HTTPS, sichere Aufbewahrung von `.env`/Schlüssel, Login-Schutz gegen Brute Force, ggf. Sicherheitsprüfung.
- **PSD2-Freigabe:** Banken verlangen alle 90 bis 180 Tage eine neue Bestätigung. Ohne den Nutzer sind laut finAPI-Doku bis zu 4 Aktualisierungen pro Tag möglich.
