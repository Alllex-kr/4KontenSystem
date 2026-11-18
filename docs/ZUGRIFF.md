# Zugriff, Berechtigungen und Abos

Vierklee regelt den Zugriff auf Funktionen ähnlich wie Salesforce: **Was ein Nutzer in keinem seiner Berechtigungssätze hat, darf er nicht.**

## Bausteine

```
Berechtigung  →  Berechtigungssatz  →  Satzgruppe  →  Abo / Personengruppe / Person
```

| Baustein | Was es ist | Wo |
|---|---|---|
| **Berechtigung** | Ein Schlüssel für eine Funktion, z. B. `ai.categorize` | im Code: `src/lib/access/catalog.ts` |
| **Berechtigungssatz** | Pro Funktion ein Satz, automatisch angelegt (Inhalt fest). Eigene Sätze mit mehreren Rechten sind möglich. | `/admin/berechtigungen` |
| **Satzgruppe** | Bündelt zusammengehörige Sätze (wie Permission Set Groups in Salesforce) | `/admin/satzgruppen` |
| **Abo** | Enthält Satzgruppen (und bei Bedarf einzelne Sätze) | `/admin/abos` |
| **Personengruppe** | Menschen mit gemeinsamen Extra-Rechten, z. B. „Beta-Tester“ | `/admin/gruppen` |
| **Direkt** | Satzgruppe oder einzelner Satz für eine Person, optional befristet | `/admin/nutzer/…` |

Ein Nutzer darf alles, was über Abo, Personengruppen oder direkte Zuweisungen bei ihm ankommt. Unter „Effektive Berechtigungen“ steht der ganze Weg, z. B. `Abo „Kostenlos“ → Daten-Import → CSV-Import`.

### Funktionen und Satzgruppen

| Funktion (Satz) | Schlüssel | Satzgruppe |
|---|---|---|
| CSV-Import | `import.csv` | Daten-Import |
| Bankanbindung | `bank.connect` | Daten-Import |
| Rücklagen | `reserves.use` | Planung |
| Sparziele | `goals.use` | Planung |
| Dashboard & Design anpassen | `customize.use` | Personalisierung |
| KI-Kategorisierung | `ai.categorize` | KI-Paket |
| Adminbereich öffnen | `admin.access` | Admin-Rechte, Support |
| Nutzer verwalten | `admin.users` | Admin-Rechte, Support |
| Berechtigungen verwalten | `admin.access_control` | Admin-Rechte |

Immer frei (Kern des Vier-Konten-Systems): Dashboard, Konten, Buchungen, Fixe Zahlungen, Einstellungen.

Abos: **Kostenlos** = Daten-Import + Planung + Personalisierung. **Vierklee Plus** = dasselbe + KI-Paket. **Administrator** = Vollzugriff auf alles, auch auf künftige Funktionen (System-Abo, nicht buchbar, nicht löschbar).

## Admin werden

Admins sind im Abo **„Administrator“**. Es gibt automatisch jede Berechtigung aus dem Katalog, also alle Funktionen inklusive Adminbereich, auch solche, die später dazukommen.

- E-Mail-Adressen in `ADMIN_EMAILS` (`.env`, Komma-getrennt) sind **immer** in diesem Abo und lassen sich in der App nicht herabstufen. Schutz davor, sich auszusperren.
- Weitere Admins: im Nutzer das Abo „Administrator“ wählen.
- Eingeschränkte Helfer: Satzgruppe „Support“ (Nutzer verwalten, aber keine Abos oder Berechtigungen) oder „Admin-Rechte“ (ganzer Adminbereich) zusätzlich zu ihrem normalen Abo geben.
- Niemand kann sich selbst Adminrechte entziehen, darum bleibt immer mindestens ein Admin übrig.

## Neue Funktion freischaltbar machen

1. In `src/lib/access/catalog.ts` einen Schlüssel ergänzen, z. B. `"budget.export"`.
2. Im Code prüfen:
   - Seite: `await requirePermission("budget.export")`
   - Server Action: `if (!(await can(user.id, "budget.export"))) return { error: "…" }`
   - Oberfläche ein-/ausblenden: `can(...)` auf dem Server auswerten und als Prop weitergeben
3. Beim nächsten Start legt Vierklee automatisch den Satz dafür an. Im Adminbereich packst du ihn in eine Satzgruppe (oder gibst ihn direkt einem Abo, einer Personengruppe oder Person). Bis dahin ist die Funktion für alle gesperrt.

Wichtig: Immer auf dem **Server** prüfen. Ausgeblendete Knöpfe allein schützen nichts.

## Später: Bezahlung

Das Abo eines Nutzers steht in `User.planId`. Ein Zahlungsanbieter (z. B. Stripe) muss bei Kauf, Kündigung oder fehlgeschlagener Zahlung nur dieses Feld setzen. Die Berechtigungen folgen automatisch. Das `key` eines Abos (z. B. `plus`) ist fest und eignet sich als Verknüpfung zum Produkt beim Zahlungsanbieter.

## Protokoll

Jede Änderung im Adminbereich landet unter `/admin/protokoll` und auf der Seite des betroffenen Nutzers.
