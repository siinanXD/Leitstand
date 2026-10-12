# SIN-488 — Vor-Recherche je Produktwunsch

**Links:** Linear [SIN-488](https://linear.app/sinan-kahraman/issue/SIN-488), [SIN-202](https://linear.app/sinan-kahraman/issue/SIN-202) (Projekt-Starter), Vorbild `trend-radar` und `source-check` der Lern-App.

## Entscheidung

- Der Research-Agent läuft vor dem Planer, einmal je Wunsch, mit dem Claude-Abo und Websuche (`claude -p`, `--max-turns` = `MAX_RUNDEN`). Kein API-Geld.
- Der Bericht liegt unter `docs/research/wunsch-<kurzname>.md`, höchstens eine Seite, mit sechs festen Abschnitten (Konkurrenz, Bausteine, Agenten und Modelle, Kosten, Recht, Empfehlung).
- `pruefeBericht` verwirft Berichte ohne alle Abschnitte, ohne mindestens drei Quellen-Links, über einer Seite oder ohne Empfehlung (**bauen**, **anpassen**, **nicht bauen**). Nichts Unbelegtes wird geschrieben.
- Der Wunschtext geht als Daten in den Auftrag (zwischen `<wunsch>`-Markierungen), nicht als Anweisung.
- Sinan entscheidet über „Braucht dich“ mit „Bauen“ oder „Verwerfen“. Projekt-Starter und Planer starten nur, wenn `darfBauen(entscheidung)` wahr ist, also bei ausdrücklichem „bauen“. Alles andere, auch fehlende Antwort, legt nichts an.
- Rechtliche Hinweise sind keine Rechtsberatung und werden so vermerkt.

## Umgesetzt (dieser PR)

- Logik rein und getestet: `src/lib/recherche/recherche.ts`.
- Skript mit Trockenlauf: `scripts/recherche/recherche.ts` (`DRY_RUN=1`).

## Noch offen (eigene Schritte)

- Workflow `recherche.yml` (Auslöser: Linear-Label `wunsch`): Agenten dürfen `.github/workflows/` nicht ändern, und solche PRs mergt Sinan selbst.
- Eingabefeld auf der Startseite und Push „Braucht dich“ samt „Bauen“/„Verwerfen“-Aktion (serverseitig, mit Protokoll in `loop_events`).
- Anbindung an den Projekt-Starter, sobald SIN-202 fertig ist.
- Echter Beispielbericht: braucht einen Lauf mit `CLAUDE_CODE_OAUTH_TOKEN` und Websuche. Er wurde hier nicht erzeugt, weil erfundene Quellen gegen die Grundregel verstoßen.
