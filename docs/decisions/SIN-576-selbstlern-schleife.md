# SIN-576: Selbstlern-Schleife

- Logik rein in `src/lib/lernen/schleife.ts` (getestet), Netz in `scripts/lernen/woche.ts`, Skill `docs/skills/lernen/SKILL.md` (Teil von Prüfen, keine neue Rolle), Schema `docs/schemas/lernen.json`, Kachel `src/app/gelernt-kachel.tsx` auf `/details`.
- **Messen (montags 05:30 UTC, ohne Modell):** je Produkt aus den gemergten PRs der letzten 7 Tage (GitHub) und `loop_events`: Merges/Tag, Anteil Reparatur-PRs (Titel `fix…` oder Label `repair:*`), Anteil Loop-/Meta-PRs (Scope `ci`, `loop`, `autonomy`, `waechter`, `lernen`, `hausmeister`, `workflow`, `werkzeuge`), Freigaben (Label `freigegeben`), Kosten je PR (Summe `loop_events.cost`, US-Dollar). Anteile gibt es erst ab 5 PRs, sonst `null`.
- **Schlechtester Wert:** größter relativer Abstand zum Ziel (Reparatur ≤ 15 %, Loop/Meta ≤ 25 %, Merges ≥ 3 je Tag, Richter ≥ 80 %, Fertig-Liste 100 %), über alle Produkte. Rein, ohne Modell.
- **Eine Änderung je Woche:** Haiku (Deckel 1 €, Preise wie Vorarbeiter Spur C) bekommt Messung, Vorwoche, `LEHREN.md`, die 10 letzten roten Läufe und das Verworfene. Antwort: Datei, **eine** Regelzeile, erwarteter Effekt. Geprüft wird in `leseVorschlag`: Datei nur `AGENTS.md` oder `docs/skills/*/SKILL.md`, höchstens 300 Zeichen, nichts zu Sicherheit/Gate/Freigabe/Auth/Secrets/Workflows, nicht aus `VERWORFEN.md`. Vorher-Wert, Produkt und Ziel kommen aus der Messung, nie vom Modell. Die Zeile steht unter `## Gelernt (SIN-576)`; ein Revert entfernt genau diese Zeile.
- **Nachmessen:** in der Folgewoche besser → `BEHALTEN.md`; gleich oder schlechter → Revert und `VERWORFEN.md`; nicht messbar (`null`) → bleibt, wird erneut gemessen. Nach einem Revert gibt es keinen neuen Vorschlag (ein Revert ist die Änderung der Woche).
- **PR:** `lernen.yml` öffnet `lernen/<KW>`; `automerge.yml` vergibt `risk:medium` (Sicherheits-/Gate-Dateien sind für den Vorschlag gesperrt) und mergt nach grünem `build`.
- **Kachel:** liest `loop_events` Schritt `lernen`, Feld `payload` (Woche, Messwert, Änderung, Ergebnis der Vorwoche). Bestehende Kachel-Form, keine neue Route.
- Keine neue Abhängigkeit.

## Aufgabe für Sinan (Label `sinan`)

1. `docs/lernen/lernen.yml.vorlage` nach `.github/workflows/lernen.yml` kopieren. Variablen `VORARBEITER_PREIS_EIN_USD`, `VORARBEITER_PREIS_AUS_USD`, `KOSTEN_USD_EUR` und Secret `ANTHROPIC_API_KEY` müssen stehen (sonst nur Messung).
2. Erst von Hand mit `dry_run`, dann ohne. Zwei Montage abwarten (Vorschlag, dann Nachmessung).

## Ausgelassen

- **„Fertig, wenn“ nicht erfüllt:** „Zwei Wochen gelaufen“ und „Kachel zeigt echte Werte“ brauchen Netz, Schlüssel und Zeit; es gibt noch keine `woche-*.json`. Erfundene Werte wären schlimmer als keine, die Kachel zeigt bis dahin „Noch kein Lauf“.
- Nicht gemessen (immer `null`): Leerlauf-Stunden, Richter-Bestehensquote, Fertig-Liste-Fortschritt. Dafür fehlt hier die Datenquelle (Langfuse-Anbindung, Kontingent-Verlauf, Form von `loop_snapshot.progress`); der Vorschlag greift sie erst an, wenn sie gemessen werden.
- Schritt 4 (Richter-Feedback → drei „vermeide …“-Sätze im Content-Prompt): weggelassen, die Richter-Begründungen liegen in der Lern-App/Langfuse und sind hier nicht lesbar. Der Mechanismus (eine Zeile unter `## Gelernt`, gleiche Nachmessung) trägt ihn später, die Datei wäre `docs/skills/content/SKILL.md`.
- Schwellen in `docs/autonomy/config.json`: weggelassen, die Datei gibt es nicht. Der Vorschlag ändert nur Markdown-Regelzeilen.
- Zeile im Gedächtnis: weggelassen, das Ereignis in `loop_events` ist der Beleg; bei Bedarf wie `gedaechtnisZeilen` (SIN-575) ergänzen.
- Mehrere Produkt-Repos mit eigener Regeländerung: die Schleife ändert nur Regeln dieses Repos (Steuerung nur im Leitstand, SIN-577); das schlechteste Produkt bestimmt das Ziel.
- Eine Woche ist ein kleines Muster; ein einzelner PR mehr oder weniger kann das Urteil kippen. Bewusst einfach nach dem Issue („besser, sonst Revert“).
- Nicht geprüft: Lauf des Workflows, GitHub-/Anthropic-/Supabase-Aufrufe (nur nach der API-Doku geschrieben), Darstellung der Kachel im Browser. Kachel: kein Figma-Frame, bestehende Form und Tokens.
