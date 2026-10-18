# SIN-832: Codex-Übergabe über einen Draft-PR

Bestehende Agenten können risikoarme Aufgaben über einen markierten Draft-PR im Leitstand an den eingerichteten ChatGPT/Codex-Ereignis-Worker übergeben. [Protokoll](../CODEX-WORKER.md), [Pilot PR 266](https://github.com/siinanXD/Leitstand/pull/266).

Grund: Der bestehende GitHub-Zugang reicht aus; keine zusätzlichen Secrets, Workflow-Rechte oder API-Key-Aufrufe. Direkte Linear-Ereignisse sind im aktuellen Rollout nicht verfügbar. Ein Implementierer je Issue verhindert konkurrierende Arbeit. Der bestehende Dispatcher wird nicht geändert.

Der automatische Eingang wurde durch das PR-opened-Ereignis am 18.10.2026 ausgelöst und im [Startkommentar](https://github.com/siinanXD/Leitstand/pull/266#issuecomment-6253794114) bestätigt. Die beiden Datei-Proben in docs/abnahme.yml prüfen nur Protokoll und Auffindbarkeit; sie ersetzen weder den echten Worker-Lauf noch das noch offene produktive Routing in SIN-826.

Ausgelassen: keine eigene Worker-UI, kein Planer-Umbau, keine automatische Codex-CI-Reparatur und keine Ausweitung der Security-/Produktionsfreigaben.
