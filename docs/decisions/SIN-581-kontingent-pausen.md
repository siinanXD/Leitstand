# SIN-581: Kontingent-Pausen zentral im Leitstand

## Entscheidung

Eine Tabelle `kontingent_pausen` (`dienst`, `bis`, `grund`, `repo`, `erstellt_at`, `geweckt_at`) hält jede Pause mit Reset-Zeit. Logik rein in `src/lib/kontingent/` (mit Tests), Netz in `scripts/kontingent/`. Passt zu SIN-577: Steuerung nur im Leitstand.

- **Melden:** `kontingent.ts melden` liest das Log. Reihenfolge der Zeit: Meldung im Log („resets 7pm (Europe/Berlin)“, ohne Zone UTC wie bisher in der Lern-App), Header, Standard je Dienst. Liegt die gefundene Zeit in der Vergangenheit, gilt der Standard.
- **Beachten:** `scripts/loop/loop.ts dispatch` prüft `claude` und startet bei Pause nichts (`loop_events`: `dispatch`/`uebersprungen`, Grund im Log in Worten). Andere Rollen rufen `kontingent.ts pruefen --dienst …` (Exit 3 = Pause).
- **Wecken:** `kontingent.ts wecken` stößt `dispatch` der betroffenen Repos an (`WECK_ZIELE`), bei `vercel_deploys` den Deploy-Hook, setzt `geweckt_at` und schreibt `kontingent`/`wieder-da`. Schlägt das Anstoßen fehl, bleibt die Pause offen und der nächste Lauf versucht es erneut.
- **Wächter:** Wurde nach dem Start eines Issues eine Claude-Pause gemeldet, gilt es nicht als Hänger, sondern geht sofort zurück auf Todo, nie `needs-human`.

## Noch offen (braucht Workflow-Rechte oder Sinan)

Der Agent darf `.github/workflows/` nicht ändern. Diese Schritte fehlen deshalb und gehören in einen Folge-PR von Hand:

1. `wecker.yml` (alle 15 Minuten, `workflow_dispatch`, `DRY_RUN`-Eingabe): Checkout, `npm ci`, `npx tsx scripts/kontingent/kontingent.ts wecken` mit `GH_TOKEN: secrets.AGENT_WORKFLOW_TOKEN`, `SUPABASE_*`, `VERCEL_DEPLOY_HOOK`.
2. In `claude.yml` nach dem Claude-Schritt (`if: failure()`): Log sichern und `kontingent.ts melden --dienst claude --log <Datei>` aufrufen; vorher `pruefen --dienst claude`.
3. Lern-App `worker.yml` / `dispatch.yml`: zusätzlich zur Repo-Variable `melden` und `pruefen` aufrufen (anderes Repo).
4. Anstoß von außen per `workflow_dispatch` (cron-job.org) als `sinan`-Issue über `scripts/autonomy/sinan.mjs`.
5. Karte „Was passiert gerade?“ mit `pauseSatz()` und Push-Mitteilung beim Pausieren und Wecken (`leitstand_push_abos`).

## Ausgelassen

Wecken auf die Minute genau (GitHub kennt keine einmaligen Zeitpläne): Verzug höchstens 15 Minuten plus GitHub-Verspätung. Die Claude-App-Mitteilung wird nicht weitergeleitet, der Worker sieht dieselbe Meldung im Log. Die Rollen Pipeline und Werber (`openai`, `anthropic_api`, `higgsfield`) rufen `pruefen` noch nicht auf.
