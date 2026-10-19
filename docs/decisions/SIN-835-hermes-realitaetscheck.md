# SIN-835: Hermes-Realitätscheck (Stand 19.10.2026)

**Links:** Linear [SIN-835](https://linear.app/sinan-kahraman/issue/SIN-835), [SIN-512](https://linear.app/sinan-kahraman/issue/SIN-512), [SIN-513](https://linear.app/sinan-kahraman/issue/SIN-513), [SIN-576](https://linear.app/sinan-kahraman/issue/SIN-576), [SIN-577](https://linear.app/sinan-kahraman/issue/SIN-577), [SIN-819](https://linear.app/sinan-kahraman/issue/SIN-819), [SIN-235](https://linear.app/sinan-kahraman/issue/SIN-235).

## Entscheidung

Hermes wird vorerst **nicht** installiert. Dispatcher, CEO und Vorarbeiter bleiben die einzige Steuerung (SIN-577). Erst die Teilumsetzungen von SIN-512 und SIN-513 schließen und den Betrieb stabilisieren (SIN-819), dann Hermes nur bei messbarem Zusatznutzen (Kosten, Stabilität, Diagnose) pilotieren. Keine zweite Steuerzentrale, keine neuen Chat-Gateways.

## Abgleich gegen den Code (main)

Geprüft wurde nur das Repo. Actions-Läufe, Secrets, Supabase-Inhalte und Produktion sind **nicht** geprüft.

| Teil | Im Repo | Fehlt |
| --- | --- | --- |
| Betriebslogik (SIN-513) | `src/lib/betrieb/betrieb.ts` mit Tests: Kostenbudget, Ereignis `betrieb`, Tagesbericht | Hermes selbst (keine Abhängigkeit, kein Aufruf) |
| Betriebs-Skript (SIN-513) | – | `scripts/betrieb/` existiert nicht |
| Betriebs-Workflow (SIN-513) | – | `.github/workflows/betrieb.yml` und `hermes.yml` existieren nicht |
| Tagesbericht-Karte, „Braucht dich“, Push (SIN-513) | – | keine Karte in der Übersicht |
| Lernlogik (SIN-512) | `src/lib/lernen/lernen.ts`, `scripts/lernen/lernen.ts`, Ordner `docs/autonomy/lehren/` | – |
| Täglicher Lauf und Lauf nach rotem Lauf (SIN-512) | – | kein Workflow ruft `scripts/lernen/lernen.ts` auf; `lernen.yml` ist die **wöchentliche** SIN-576-Schleife (`woche.ts`, montags 05:30 UTC) |
| Berichte (SIN-512) | – | `docs/autonomy/berichte/` existiert nicht, also nie committet |
| Live-Bericht, Skill-PRs (SIN-512) | – | nicht vorhanden |

## Nacharbeiten (jeweils ein eigenes, kleines Issue)

1. **SIN-512 täglich:** Workflow für `scripts/lernen/lernen.ts` (täglich und nach rotem `build`), Bericht im Leitstand, Abnahme-Probe auf einen frischen Bericht. Vorab entscheiden, ob die tägliche Auswertung in die wöchentliche Schleife (SIN-576) einfließt, statt doppelt zu laufen.
2. **SIN-513 ohne Hermes:** `scripts/betrieb/` und `betrieb.yml` auf Basis von `betrieb.ts`, Tagesbericht-Karte. Nützlich, auch wenn Hermes nie kommt.
3. **Hermes-Pilot:** erst danach, mit den offenen Fragen aus `SIN-513-hermes-betrieb.md` (Installation, Lizenz, Modellanbindung, Kosten) und einem Messkriterium vorab.
4. **Live-Nachweis:** Actions-Läufe, Secrets und Supabase-Berichte prüft die Abnahme (SIN-626), nicht dieser Abgleich.

## Status-Hinweis

„Done“ bei SIN-512 und SIN-513 bedeutet bisher **Teilimplementierung**, nicht Ende-zu-Ende-Nachweis (SIN-616).
