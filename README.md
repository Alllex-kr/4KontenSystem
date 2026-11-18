# 🍀 FinanzKlee – Glück ist planbar.

Web-App für Studierende, um Geld mit dem Vier-Konten-System zu organisieren. Markenleitfaden: [docs/BRAND.md](docs/BRAND.md).


| Konto | Zweck |
| --- | --- |
| **Fixkosten** | Einkommen kommt hier an, Miete, Handy, Versicherungen und unregelmäßige Kosten (Semesterbeitrag …) laufen von hier |
| **Sparen** | Langfristiges Sparen, Sparziele, ETF-Sparplan |
| **Notgroschen** | Reserve für Unerwartetes, Ziel = X Monate Fixkosten |
| **Freizeit** | Was übrig bleibt, darf ausgegeben werden |

Die Rechenlogik orientiert sich an der Excel-Vorlage „Kontensystem V48“ (Monatliche/Nicht-monatliche Zahlungen, Mindestpuffer, Saldo-Verlauf, Reserve, empfohlene Daueraufträge).

## Funktionen

- Registrierung und Login (bcrypt-Passwort-Hash, Session-Token als httpOnly-Cookie, nur Hash in der DB)
- Dashboard: Kennzahlen, Kontenkarten, Verteilung des Einkommens, 60-Tage-Prognose des Fixkostenkontos mit Mindestpuffer-Warnung, 12-Monats-Vermögensprognose, Einnahmen/Ausgaben, Kategorien, empfohlene Daueraufträge
- Fixe Zahlungen: monatlich, alle 2/3/6/12 Monate, automatische Monatsrate, Jahresverlauf der Rücklage, benötigter Startpuffer
- Buchungen: Ausgaben/Einnahmen pro Konto, Filter nach Monat/Konto, Tages- und Kategorie-Diagramme
- Konten: Kontostand abgleichen, Umbuchungen zwischen Konten
- Sparziele mit Fortschritt, nötiger Monatsrate und Prognose
- Einstellungen: Mindestpuffer, Sparquote, Notgroschen-Ziel und -Quote, Tag der Daueraufträge
- Beispieldaten per Klick
- **Frei anpassbares Dashboard**: 13 Widgets, per Drag & Drop (auch Touch) oder Pfeiltasten sortieren, Größe S/M/L/XL, ausblenden, Vorlagen (Standard, Minimal, Analyse)
- **Design & Anpassen**: Hell/Dunkel/System, 7 Akzentfarben, große Schrift, eigene Kontonamen und -farben, Beträge verbergen (Privatsphäre)
- **Mobil zuerst**: untere Navigation, Schnellbuchungs-Button (+), Bottom-Sheets, 16-px-Eingaben (kein iOS-Zoom), Safe-Area für iPhone, Foldable-Breakpoint ab 600 px und Unterstützung für die Viewport Segments API
- **Animationen**: weiche Seitenwechsel mit Lade-Skelett, gestaffelt einblendende Karten, hochzählende Beträge, wachsende Balken und Ringe, gleitende Navigations-Markierung, Theme-Wechsel mit Kreis-Effekt, Bottom-Sheets zum Wegwischen, Erfolgs-Effekt mit Kleeblättern. Einstellbar unter Design & Anpassen (Automatisch / Immer an / Aus), „Automatisch“ folgt „Bewegung reduzieren“ des Geräts.
- **Installierbar als App** (Web-App-Manifest, Shortcut „Ausgabe eintragen“)
- **CSV-Import** aus dem Online-Banking: erkennt Sparkasse (CSV-CAMT), ING, DKB, Volksbank/Raiffeisen, comdirect und N26 automatisch (Zeichensatz, Trennzeichen, Vorspann, deutsche Beträge), schlägt Kategorien vor, lernt aus Korrekturen, überspringt Duplikate und kann den Kontostand übernehmen. Die Datei wird nur im Browser gelesen. Beispieldateien liegen in `public/beispiele/`.
- **KI-Kategorisierung mit Claude (optional, Opt-in)**: Umsätze ohne passende Regel oder Stichwort ordnet Claude (`claude-opus-5-5`, strukturierte JSON-Antwort, Fallback bei Ablehnungen) beim CSV-Import und Bank-Sync ein. Gesendet werden nur Empfänger, Verwendungszweck ohne IBANs/Nummern/E-Mails und Betrag. Gleiche Empfänger werden einmal gefragt, Ergebnisse als Regel gemerkt. Monatslimit und Kostenschätzung unter Einstellungen. Einrichtung: `ANTHROPIC_API_KEY` in `.env`.
- **Bankkonten verbinden (optional)**: Live-Abruf von Kontoständen und Umsätzen über finAPI (PSD2), vorbereitet und gegen nachgebaute Antworten getestet. Ohne Zugangsdaten läuft eine Demo-Bank. Einrichtung: [docs/BANKANBINDUNG.md](docs/BANKANBINDUNG.md).

## Tech-Stack

Next.js 15 (App Router, Server Actions) · TypeScript · Prisma + SQLite · Tailwind CSS 4 · Recharts · dnd-kit · Zod · Vitest

## Starten

```bash
npm install
npx prisma db push
npm run dev
```

Dann <http://localhost:3000> öffnen, registrieren und auf dem Dashboard „Beispieldaten laden“ klicken.

Weitere Befehle:

```bash
npm test          # Tests des Rechenkerns (src/lib/finance.ts)
npm run typecheck # TypeScript prüfen
npm run db:studio # Datenbank ansehen
```

## Auf PostgreSQL umstellen

In `prisma/schema.prisma` `provider = "postgresql"` setzen, `DATABASE_URL` in `.env` anpassen und `npx prisma db push` ausführen.

## Projektstruktur

```
prisma/schema.prisma      Datenmodell (Beträge in Cent)
src/lib/finance.ts        Rechenkern: Verteilung, Prognosen, Rücklage
src/lib/auth.ts           Sessions und Login-Prüfung
src/actions/              Server Actions (Login, Buchungen, Zahlungen …)
src/app/(auth)/           Login & Registrierung
src/app/(app)/            Geschützte Seiten (Dashboard, Konten, …)
src/components/           UI-Bausteine, Diagramme, AppShell, Schnellbuchung
src/components/brand/     Logo (Bildmarke + Wortmarke)
src/lib/brand.ts          Name, Slogan, Markenfarben
src/lib/dashboard.ts      Widgets, Größen, Vorlagen
src/lib/appearance.ts     Themes, Akzentfarben, Schriftgröße
src/lib/csvImport.ts      CSV-Parser, Spaltenerkennung, Kategorien, Duplikat-Erkennung
src/lib/banking/          Bankanbindung: Anbieter-Schnittstelle, Demo-Bank, finAPI, Sync, Verschlüsselung
src/lib/ai/               KI-Kategorisierung (Claude), Verbrauch und Limit
src/lib/planning.ts       Rücklagen, Ausgleich, notwendige Überweisungen, Checkliste
```
