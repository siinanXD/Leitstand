# SIN-544: Werkzeuge verknüpfen

## Was gebaut ist

- Seite `/werkzeuge`: 8 Zeilen (Sentry, PostHog, Langfuse, OpenAI / Anthropic, Postman, Figma, Hugging Face, Linear) mit Punkt grün/rot (zusätzlich als Text), letzter erfolgreicher Verbindung und einem Satz „was macht es für dich“. Ohne gespeicherte Prüfung steht „nicht geprüft“, nie grün.
- Prüfung: `scripts/werkzeuge/pruefen.ts` (Anfragen und Bewertung rein in `src/lib/werkzeuge/werkzeuge.ts`, mit Tests). Je Tool eine lesende Anfrage; Ergebnis in `leitstand_werkzeug_status` (Migration `20261014100000`). Fehlt ein Key, ist das Tool rot mit „Key fehlt: NAME“. Der Worker trägt keine Secrets ein.
- Langfuse-429: Kosten fragen Langfuse höchstens einmal je 10 Minuten (`src/lib/kosten/cache.ts`); bei Fehler gilt bis zu einer Stunde der letzte gute Stand, danach „nicht verfügbar“.

## Aufgaben für Sinan (Label `sinan`)

1. `.github/workflows/werkzeuge.yml` aus `docs/werkzeuge/werkzeuge.yml.vorlage` anlegen (der Worker darf Workflows nicht ändern) und die Secrets/Variablen eintragen, die die Seite als „Key fehlt“ meldet. `LINEAR_API_KEY`, `FIGMA_ACCESS_TOKEN`, `SUPABASE_*` gibt es bereits.
2. Sentry (Lern-App): `NEXT_PUBLIC_SENTRY_DSN` in Vercel gesetzt? Testfehler auslösen und prüfen, ob er in Sentry ankommt (die Live-Prüfung ist seit SIN-539 rot, bei 0 Fehlern im Monat ist die Anbindung vermutlich falsch). Danach in Sentry unter Settings → Integrations → Linear verbinden und eine Alert-Regel „neues Issue → Linear-Issue (Label `Bug`)“ anlegen. Ab 10 betroffenen Nutzern pro Stunde zusätzlich Label `dringend`.
3. Migration `supabase/migrations/leitstand/20261014100000_werkzeug_status.sql` anwenden.

## Bewusst nicht in diesem Repo

- **Postman/Newman:** Collection aus der OpenAPI der Lern-App und der CI-Job `api-tests` gehören in `siinanXD/Content-Agent-Lernapp` (dort liegt die OpenAPI, dort läuft die CI). Eigenes Issue dort. Der Leitstand prüft hier nur, ob der Postman-Key funktioniert.
- **Loop-Worker mit Werkzeugen** (MCP statt nur Bash): nicht Teil von SIN-544.
