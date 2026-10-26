# SIN-1078: Python-Agent-Vorlage für neue Produkte (FastAPI, Supabase, Modal, Langfuse)

Stand 26.10.2026. Gilt für neue Produkte mit eigenen Agenten (Lifestyle App SIN-1078 ff., Social Media Agent SIN-1077). Der Leitstand wird nicht umgebaut (Audit SIN-1088: „kein Plattform-Rewrite“). Pilot für eine Leitstand-Rolle bleibt SIN-836.

## Entscheidung

Ein Agent ist ein Python-Modul, das einen Modell-Aufruf macht und ein JSON-Ergebnis zurückgibt. Jeder Aufruf ist in Langfuse als Trace sichtbar (Prompt, Antwort, Tokens, Kosten). Zustand liegt in Postgres, nie im Prozess. Kein eigener Server.

| Baustein | Wahl | Grund |
| --- | --- | --- |
| API | FastAPI, Pydantic-Modelle für Ein- und Ausgabe | wie Stromlauf AI, kein zweites Muster |
| Datenbank | Supabase Postgres (EU), SQLAlchemy + Alembic | pgvector eingebaut, RLS, gleiche Konsole wie Lern-App |
| Vektor-Gedächtnis | pgvector in derselben Datenbank | keine zweite Datenbank |
| Schlange | pgmq (Supabase) + pg_cron | lange Läufe werden Schritte, Fortsetzung per Queue |
| Kurze Läufe (< 5 Min) | Vercel Functions (Python), `maxDuration` je Funktion setzen | Hobby 300 s, Pro bis 800 s |
| Lange Läufe (Minuten bis Stunden, FFmpeg, Batch) | Modal, `timeout` je Funktion (bis 24 h) | serverless, Abrechnung je Sekunde, ersetzt Railway |
| Tracing | Langfuse Python SDK, `@observe` um jeden Modell-Aufruf | Ergebnis sofort sichtbar, Kosten je Lauf |
| Modell-Aufruf | Anthropic SDK direkt, kein Framework | ein Aufruf, eine Antwort, kein Graph |
| Secrets | Infisical (SIN-611), keine `.env` im Repo | bestehend |

Weggelassen: Redis (erst bei gemessenem Bedarf, dann Upstash), Graph-Gedächtnis wie Graphiti (braucht Neo4j/FalkorDB als Dienst), LangGraph (nur wenn ein Agent mehr als drei Werkzeuge in Schleife braucht).

## Regel für lange Läufe

Ein Lauf ist eine Kette kurzer Schritte. Jeder Schritt liest seinen Zustand aus Postgres, macht höchstens einen Modell-Aufruf, schreibt das Ergebnis zurück und legt den nächsten Schritt in die Queue. So passt jeder Schritt in jedes Zeitlimit, ein Absturz verliert nur einen Schritt, und Langfuse zeigt jeden Schritt als Span desselben Traces (`trace_id` = Lauf-ID).

## Warum nicht wie der Leitstand

Der Leitstand ist ein Steuerwerk: GitHub-Actions-Workflows als Laufzeit, Claude Code als Worker mit Werkzeugen, Ergebnis als Zeile in `loop_events`. Das ist richtig für „Code schreiben, PR öffnen, Gate prüfen“, aber langsam (Minuten Startzeit), ohne Trace je Aufruf und nur über Logs nachvollziehbar. Produkt-Agenten brauchen das Gegenteil: Start in Sekunden, Antwort als JSON, Trace sofort.

## Fertige Vorlagen (geprüft 26.10.2026)

- `nicholasgoh/fastapi-mcp-langgraph-template`: FastAPI, Langfuse, Supabase/pgvector, Postgres-Checkpointer. Nächste am Stack, aber mit LangGraph und Docker Compose; als Referenz für Langfuse- und Supabase-Anbindung nutzen, nicht übernehmen.
- `wassim249/fastapi-langgraph-agent-production-ready-template` (ca. 1.400 Sterne): Langfuse, pgvector, mem0; kein Supabase, kein Modal.
- `HKUDS/OpenHarness` (MIT, 12.800 Sterne, seit 04/2026): Python-Harness für Werkzeuge, Skills, Gedächtnis, Multi-Agent. Kandidat, sobald ein Agent mehr als einen Aufruf in Schleife braucht; für die Vorlage zu schwer. Zwei weitere Projekte heißen gleich (TypeScript-SDK auf Vercel AI SDK; Kommandozentrale für Coding-Agenten) und sind nicht gemeint.
- Keine Vorlage kombiniert FastAPI, Supabase, Langfuse und Modal. Die Vorlage entsteht daher als Repo `siinanXD/python-agent-vorlage` mit einem Beispiel-Agenten (ein Endpunkt, ein Modell-Aufruf, ein Trace, ein Alembic-Schema, eine Modal-Funktion, Tests mit Mock-Modell).

## Vor dem ersten Produkt

1. Langfuse-Projekt je Produkt mit eigenen Schlüsseln (SIN-1049); Gratis-Limit beachten (SIN-1048).
2. Vorlage-Repo anlegen, CI mit ruff, pytest, Alembic-Migration von null, gitleaks (wie Stromlauf AI).
3. Erste Abnahme-Probe im Leitstand: `GET /health` 200 und ein Langfuse-Trace je Testlauf.

Quellen: Modal-Doku Functions (Timeout bis 24 h), Vercel Functions Limitations (300 s Hobby, 800 s Pro), GitHub-Seiten der genannten Repos.
