# GitHub-Profil der Loop-Repos (SIN-752)

Vorschlag je Repo: eine Beschreibung in einem Satz (Englisch, passend zum README) und 8 Topics. Gesetzt wird nichts von hier aus: Beschreibung und Topics der Repos setzt der Workflow `vitrine.yml` aus [`docs/vitrine.json`](vitrine.json) (dort derzeit deutsche Beschreibungen und je 10 Topics). Wer den Vorschlag übernehmen will, ändert `docs/vitrine.json`; der Workflow läuft nach dem Merge.

| Repo | Beschreibung (Vorschlag) | Topics (Vorschlag) |
| --- | --- | --- |
| siinanXD/Leitstand | Control room for autonomous coding agents: Linear dispatcher, Claude worker, second-model reviewer, repair loop and hourly acceptance probes. | `ai-agents`, `agent-orchestration`, `claude`, `llm`, `nextjs`, `supabase`, `typescript`, `github-actions` |
| siinanXD/Content-Agent-Lernapp | Learning app for vocational training that generates courses from official sources and publishes only what an LLM judge passes. | `llm`, `llm-as-a-judge`, `content-generation`, `edtech`, `langfuse`, `nextjs`, `supabase`, `accessibility` |
| siinanXD/stromlauf-ai | Maintenance assistant that reads circuit diagrams, terminal plans and STEP 7 AWL programs and answers with cited sources. | `rag`, `langgraph`, `document-ai`, `ocr`, `plc`, `industrial-automation`, `fastapi`, `pgvector` |

Alle Topics stammen aus der vorhandenen Liste in `docs/vitrine.json`; weggelassen sind je zwei: Leitstand `autonomous-agents`, `llm-evaluation`; Lern-App `rag`, `typescript`; stromlauf-ai `llm`, `nextjs`.
