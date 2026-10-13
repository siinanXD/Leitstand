# SIN-575: Trend-Radar 2 (für alle Produkte)

- Logik rein in `src/lib/trend/trend.ts` (getestet), Netz in `scripts/trend/trend.ts`, Rolle `trend` in `docs/autonomy/agents.json`, Schema `docs/schemas/trend.json` (Rollen-Kopf plus `funde`), Skill `docs/skills/trend/SKILL.md`.
- **Messung ohne Modell:** GitHub-Suche je Thema (`ai-agents`, `mcp`, `nextjs`, `supabase`, `playwright`, `video-generation`, `e-learning`): neu (60 Tage, > 1.000 Sterne) oder Zuwachs > 30 % gegen `basis` in `docs/markt/trends.json` (Sterne vom letzten Wochenlauf). Hugging Face: trendende Modelle und Spaces. Changelogs: neuestes Release (höchstens 7 Tage alt) von Claude Code, OpenAI-Node, Next.js, Supabase, Langfuse über die GitHub-Releases-API (öffentlich, kein WebFetch nötig).
- **Bewertung mit Haiku per API**, Deckel 0,50 € je Lauf, Preise wie Vorarbeiter Spur C (`VORARBEITER_PREIS_*`, `KOSTEN_USD_EUR`). Das Modell liefert nur `betrifft`, `nutzen`, `aufwand_tage`, `risiko`, `empfehlung`, `jetzt_grund`. Sterne, Lizenz, URL und Zuwachs stammen aus der Messung. Fehlt Schlüssel oder Preis, ist der Deckel erreicht oder die Antwort ungültig, bleibt der Fund unbewertet und der Lauf grün (nie am Claude-Kontingent rot).
- **Regel (AGENTS.md):** Lizenz MIT/Apache-2.0, aktiv (Push in 90 Tagen), mehr als 500 Sterne, sonst höchstens `beobachten`. `betrifft: keins` ist auch höchstens `beobachten`. `jetzt` braucht `jetzt_grund` `sicherheit` oder `kosten`, sonst wird es `version`.
- **Wohin:** `version` → Linear-Issue mit Label `idee`, Meilenstein „v2 Ideen“, Backlog (Visionär SIN-573 sortiert). `jetzt` → dasselbe plus Label `sinan` und „Dringend?“ im Titel: ein Vorschlag, der Agent setzt nie selbst `dringend`. Alle Funde: Abschnitt „Trends“ (3 Zeilen) in der `Tage/`-Notiz des Gedächtnisses, Kachel „Trends“ auf `/details` (3 Zeilen, liest `loop_events` Schritt `trend`, Feld `payload.top`). Der Tageslauf meldet Schritt `trend-messung`.
- **Auslöser:** `docs/trend/trend.yml.vorlage`: sonntags 04:30 UTC Modus `woche`, Montag bis Samstag Modus `messen`. Der Worker darf `.github/workflows/` nicht ändern.
- Keine neue Abhängigkeit, keine neue Route. Die Kachel ist die bestehende Kachel-Form (wie „Gedächtnis“).

## Aufgabe für Sinan (Label `sinan`)

1. `trend.yml` aus der Vorlage anlegen. Variablen `VORARBEITER_PREIS_EIN_USD`, `VORARBEITER_PREIS_AUS_USD`, `KOSTEN_USD_EUR` und Secret `ANTHROPIC_API_KEY` stehen im Repo (sonst keine Bewertung). In Linear müssen Label `idee`, Label `sinan` und der Meilenstein „v2 Ideen“ im Projekt „Leitstand“ existieren.
2. Ersten Lauf von Hand starten: Modus `woche`, erst mit `dry_run`, dann ohne.
3. Lern-App `trend-radar.yml` abschalten, sobald der erste Lauf grün ist (Hausmeister, SIN-551).

## Ausgelassen

- **„Fertig, wenn“ nicht erfüllt:** `docs/markt/trends.json` liegt leer bei (`funde: []`). Der erste Lauf braucht Netz, `ANTHROPIC_API_KEY` und die Preise und lief hier nicht. Erfundene Funde wären schlimmer als keine. Mindestens 5 Funde, davon einer mit `betrifft: leitstand`, entstehen erst im ersten echten Lauf und hängen vom Markt ab.
- Nicht geprüft: Lauf des Workflows, GitHub-/Hugging-Face-/Anthropic-/Linear-Aufrufe (nur nach der API-Doku geschrieben; `sort=trendingScore` bei Hugging Face statt `sort=trending` aus dem Issue, bitte im Trockenlauf prüfen), Darstellung der Kachel im Browser.
- Hugging Face Papers daily: weggelassen, sie haben weder Lizenz noch Sterne und blieben nach der Regel immer `beobachten`.
- Langfuse-Kosten je Lauf: weggelassen. Die Kosten stehen im Log und im Ereignis (`payload.kosten_eur`).
- Kachel: kein Figma-Frame, bestehende Kachel-Form und Tokens. Falls Sinan eine eigene Gestaltung will, Design-Issue anlegen.
- Prompt-Injection: Beschreibungen aus dem Netz gehen nur als Datenblock in den Prompt; die Antwort wird gegen feste Listen geprüft. Mehr als ein Vorschlags-Issue kann ein Fund nicht auslösen.
