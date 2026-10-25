# Qualitätsstandard „Note 1, kein Agent-Slop“ (SIN-641)

Pflicht für Worker, Prüfer und Testnutzer. Gilt in Leitstand und Lern-App (gleicher Wortlaut). Ziel: effektiv, Sinans eigene Handschrift, kein Template-Look.

## Code

- Ponytail-Regeln (`docs/skills/ponytail/SKILL.md`), keine toten Pfade, keine Doppel-Logik.
- Jede Funktion hat einen Test und eine Abnahme-Probe (`docs/abnahme.yml`).
- Namen (SIN-1063): Funktionen als Verb (`lade…`, `pruefe…`, `baue…`), Daten als Hauptwort, Deutsch wie der Code drumherum, keine Kürzel wie `tmp`, `data2`, `foo`.
- Sauberkeits-Tor im `build` (nur geänderte Dateien): `complexity` ≤ 15, `max-lines-per-function` ≤ 60, `max-lines` ≤ 400, exportierte Funktion in `src/lib` mit Doku-Satz davor; neuer ungenutzter Export oder neue ungenutzte Datei macht `knip-neu` rot (Altfunde bleiben Warnung).

## Oberfläche

- Variante 2026: Lern-App hell-warm, Leitstand dunkel-präzise, Handy bunt-kinderleicht.
- Farbwelt Orange, Weiß, Schwarz. Nur Figma-Tokens (`var(--color-*)`), nie Hex.
- Lernpfad als Zickzack-Karte.
- Vier Zustände je Ansicht: laden, leer, Fehler, Daten.
- Keine Zahl ohne Wort.
- Eigenes Theme, kein Standard-shadcn-Look.

## Texte

- Deutsch, kurz, einfach, keine Füllwörter.
- Keine KI-Floskeln („nahtlos“, „revolutionär“, „Entdecke …“).
- Keine internen Hinweise in Lerninhalten.

## Agenten-Ausgaben

- Structured JSON nach Schema (`docs/schemas/`), kein Freitext.
- Jede Aussage mit Beleg: Link, Zahl oder Datei.

## Verbotene Muster

Maschinell gesucht von Prüfer und Testnutzer (`src/lib/standard/muster.ts`):

| Id | Verbot |
| --- | --- |
| `platzhalter` | Lorem ipsum, Platzhalter, TODO/TBD in Seiten und Inhalten |
| `coming-soon` | „Coming soon“ und Verwandte |
| `ki-floskel` | „nahtlos“, „revolutionär“, „Entdecke …“, „Tauche ein“ |
| `emoji-ueberschrift` | Emoji am Anfang einer Überschrift |
| `lila-verlauf` | Lila/violette/indigo Verläufe |
| `shadcn-standard` | Standard-shadcn-Look ohne eigenes Theme |
| `kuerzel-name` | Namenskürzel wie `tmp`, `foo`, `data2` für Variablen und Funktionen |
| – | Generische Hero-Texte (beurteilt das Prüfer-Modell, nicht per Regex) |

Treffer stehen als Fund im PR-Kommentar. Abnahme: 0 Treffer in veröffentlichten Seiten und Inhalten.

## Wow-Standard 2026

- **Bewegung mit Sinn:** CSS scroll-driven animations, View Transitions zwischen Seiten, Mikro-Animationen bei richtig/falsch, Fortschritt als Animation. Immer `prefers-reduced-motion` beachten.
- **Lernpfad als Erlebnis:** Zickzack-Pfad, dessen Fortschritt sich beim Scrollen füllt.
- **Belohnung:** kurze Erfolgs-Animation (Konfetti/Leuchten), Serien-Anzeige.
- **Bento-Layouts** für Übersichten, große Typo, viel Weißraum in Orange/Weiß/Schwarz.
- **Figma als Quelle:** Designs in Figma (inkl. Weave für Bilder/Varianten), Tokens per Variablen, dann Code.
- **Grenze:** Wow bricht nie die Ladezeit: LCP < 2,5 s, CLS < 0,1. Der Crawler aus SIN-640 prüft das.

Fertig-Kriterium Wow: 3 Referenz-Screens (Start, Lernpfad, Frage) in Figma, von Sinan abgenommen.
