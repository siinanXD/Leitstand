# SIN-1047: Kontingente je Quelle, gekennzeichnet nach Herkunft

Status: angenommen (2026-10-23)

## Entscheidung

- Jede Zeile trägt `quelle`: `team`/`api` (gemessen), `gerechnet` (Einzahlung − Verbrauch) oder `schaetzung` (Abos ohne Verbrauchs-API).
- Vercel: `v6/deployments` ohne `projectId` (optional `teamId`) liefert alle Projekte des Teams; `vercelTeam` zählt eindeutige `uid` der letzten 24 h gegen 100 (`vercel_deployments_tag`, Quelle Team). Doku: https://vercel.com/docs/rest-api/reference/endpoints/deployments/list-deployments
- OpenAI: `GET /v1/organization/costs` mit `OPENAI_ADMIN_KEY` (nur lesend). Einzahlung (USD) und Datum `seit` stehen in `docs/autonomy/kontingente.json` (`api_guthaben.openai`); Verbrauch wird ab `seit` summiert, nicht über ein gleitendes Fenster. Ohne Key „nicht messbar: Admin-Key fehlt“, ohne Einzahlung „nicht messbar: Einzahlung nicht eingetragen“, nie ein erfundener Wert. Der Sammler mischt Guthaben nach Dienst und lässt andere Dienste stehen. Die alten Konto-Zeilen „Deploys pro Tag“ der Zeile `leitstand` entfallen; Produktzeilen (SIN-1049) bleiben.
- Anthropic: Individual-Organisation, keine Admin-API, kein `ANTHROPIC_ADMIN_KEY`; Rechnung aus `pipeline_run_costs` und Prüfer-Ledger folgt separat.

## Noch offen (eigene Issues, Größe)

Anthropic-Ledger, Claude-Max-/ChatGPT-Schätzung aus `kontingent_pausen`, Supabase Egress/MAU, GitHub `/rate_limit`, Realtime auf `loop_snapshot`, Warnung über 100 % an SIN-1046.
