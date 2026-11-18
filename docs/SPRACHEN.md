# Sprachen (Deutsch, Englisch, Russisch, Türkisch, Spanisch)

Vierklee erkennt die Sprache automatisch und lässt sie umschalten: in der Seitenleiste, im „Mehr“-Menü, unter Einstellungen → Sprache sowie auf Login, Registrierung und Startseite.

**Reihenfolge:** gespeicherte Wahl im Konto → Cookie `vk_lang` (Wahl ohne Login) → Browsersprache → Deutsch.

## Neuen Text einbauen

Texte stehen im Code auf **Deutsch** und sind gleichzeitig der Schlüssel:

```tsx
// Client-Komponente
const t = useT();            // import { useT } from "@/lib/i18n/client";
<p>{t("Speichern")}</p>

// Server-Komponente / Server Action
const t = await getT();      // import { getT } from "@/lib/i18n/server";

// Mit Werten
t("Noch {n} Tage in diesem Monat", { n: daysLeft })

// Mit Hervorhebung oder Link (Wortstellung bleibt jeder Sprache überlassen)
rich(t("Tipp: Unter <link>Einstellungen</link> …"), { link: (x) => <Link href="/einstellungen">{x}</Link> })

// Außerhalb von Komponenten (Konstanten, Zod-Meldungen): nur markieren, beim Anzeigen t(text)
const LABEL = msg("Wohnen");
```

Danach die Übersetzung in **allen vier** Dateien unter `src/lib/i18n/messages/` (`en.ts`, `ru.ts`, `tr.ts`, `es.ts`) ergänzen.

`npm test` prüft automatisch:
- jeder Text aus dem Code ist in jeder Sprache vorhanden,
- Platzhalter `{…}` und Markierungen `<…>` stimmen überein,
- keine leeren oder veralteten Einträge.

Fehlt eine Übersetzung trotzdem, erscheint der deutsche Text (kein Absturz).

## Was bewusst Deutsch bleibt

- **Adminbereich** (`/admin`): nur für Admins.
- **Eingaben der Nutzer**: Kontonamen, Posten, Notizen, Beschreibungen. Unveränderte Standard-Kontonamen werden übersetzt angezeigt.
- **Kategorien** werden in der Datenbank deutsch gespeichert (z. B. `Lebensmittel`) und nur in der Anzeige übersetzt. So funktionieren Filter, Regeln und Diagramme in allen Sprachen gleich.
- **Beispieldaten** (Demo-Budget) sind deutsch.

## Formatierung

Beträge, Datum und Monatsnamen folgen der Sprache (`formatCents`, `formatDate`, `monthShort` in `src/lib/format.ts`), die Währung bleibt Euro. Eingaben wie `1.234,56` und `1,234.56` werden beide verstanden.
