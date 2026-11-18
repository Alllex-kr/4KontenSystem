# FinanzKlee – Markenleitfaden

> **Glück ist planbar.** 🍀
> Das Vier-Konten-System für dein Studium.

## Idee

Ein vierblättriges Kleeblatt ist ein Glückssymbol, und jedes seiner vier Blätter steht für eines der vier Konten. FinanzKlee nimmt Studierenden die Angst vor dem Thema Geld: freundlich, ermutigend und ohne Fachchinesisch.

## Logo

| Element | Beschreibung |
| --- | --- |
| Bildmarke | Vier Herzen als Kleeblatt, jedes um 45° gedreht, Spitzen zeigen zur Mitte (seit 19.11.2026, ohne Stiel) |
| Wortmarke | `Finanz` in Textfarbe und `Klee` in Klee-Grün, Nunito Black (bis 19.11.2026 hieß die Marke „Vierklee“) |
| Dateien | `src/components/brand/Logo.tsx` (React), `public/icon.svg` (App-Icon/Favicon) |

Die Blätter laufen im Uhrzeigersinn von oben links:

1. **Fixkosten** – Blau `#3b82f6`
2. **Sparen** – Grün `#10b981`
3. **Notgroschen** – Bernstein `#f59e0b`
4. **Freizeit** – Lila `#a855f7`

Auf farbigem Hintergrund gibt es eine einfarbige Variante (`<LogoMark mono />`). Die Vorlage des Logos liegt unter `docs/brand/finanzklee-logo.webp`.

## Farben

| Token | Hell | Dunkel | Verwendung |
| --- | --- | --- | --- |
| Klee-Grün (Primär) | `#15803d` | `#22c55e` | Buttons, Links, Wortmarke |
| Hintergrund | `#f6f8f5` | `#0c1310` | Seitenhintergrund (leicht grünlich) |
| Fläche | `#ffffff` | `#131c18` | Karten |
| Text | `#12201a` | `#e6eee9` | Fließtext |
| Gut / Schlecht / Warnung | `#047857` / `#dc2626` / `#b45309` | `#34d399` / `#f87171` / `#fbbf24` | Beträge, Hinweise |

Nutzer können die Akzentfarbe ändern (Klee, Indigo, Violett, Smaragd, Himmelblau, Rosé, Bernstein). Alle Farben liegen als CSS-Variablen in `src/app/globals.css`.

## Schrift

**Nunito** (Google Fonts): rund, freundlich und gut lesbar. Überschriften in 800–900 (Black), Text in 400–600. Beträge immer mit `tabular-nums`, damit die Ziffern untereinander stehen.

## Tonalität

- Wir **duzen** und sprechen wie gute Freund:innen, nicht wie eine Bank.
- **Ermutigend statt belehrend**: „Du liegst gut im Plan 👌“ statt „Budget eingehalten“.
- **Klar und kurz**: Ein Hinweis sagt, was passiert und was zu tun ist.
- Emojis sparsam und passend: 🍀 (Marke), 🎉 (Erfolg), 🛟 (Notgroschen).

## Formen

- Abgerundete Ecken: Karten `rounded-2xl`, Buttons `rounded-xl`, Chips `rounded-full`
- Weiche Schatten statt harter Rahmen
- Touch-Ziele mindestens 44 px hoch

## Name zentral ändern

Name, Slogan und Farben stehen in `src/lib/brand.ts`.

> **Vor einer öffentlichen Nutzung:** Prüfe beim DPMA und EUIPO, ob „FinanzKlee“ als Marke schon geschützt ist, und ob eine passende Domain frei ist.
