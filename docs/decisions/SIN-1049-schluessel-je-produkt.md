# SIN-1049: Eigene Schlüssel und Kontingente je Produkt

Status: angenommen (2026-10-23)

## Entscheidung

- `docs/autonomy/produkte.json` ist das Register der Produkte (Lern-App, Leitstand, Stromlauf AI): Repo, Infisical-Ordner, Kennungen der Projekte bei Langfuse, Sentry, Vercel und Supabase, Namen der Secrets. Nie Werte; ein Test sperrt schlüsselähnliche Werte.
- `scripts/kontingent/sammler.ts` misst je Produkt aus dem Register und schreibt `loop_snapshot.quotas` je `project`. Konto-weite Limits (Vercel-Deployments pro Tag) stehen je Produkt mit dessen Verbrauch und einmal als Summe „(alle Produkte)“ in der Zeile `leitstand`. Logik rein in `src/lib/kontingent/produkte.ts`.
- `/kosten` filtert mit dem vorhandenen `ProjektFilter` nach Produkt.
- Der Projekt-Starter-Skill nennt den Register-Eintrag als Pflichtschritt (`docs/skills/projekt-starter/SKILL.md`).

## Befund: Langfuse je Produkt

Aus diesem Repo ist nur der Leitstand prüfbar: Er liest `LANGFUSE_*` (`.env.example`, `waechter.yml`, `werkzeuge.yml`). Welches Langfuse-Projekt die Lern-App und Stromlauf AI nutzen, steht in keinem Repo, das hier lesbar ist; das Register trägt deshalb `null` (nicht geprüft) statt einer Vermutung. Die Lern-App misst ihre Kontingente bisher allein mit ihren eigenen Schlüsseln (`scripts/autonomy/status.mjs`).

Die fehlende Trennung ist eine gebündelte `sinan`-Aufgabe: Je Produkt ein eigenes Langfuse-Projekt anlegen, Schlüssel in Infisical unter `/lernapp`, `/leitstand`, `/stromlauf-ai`, Projekt-Kennungen und Vercel-Projekt in das Register eintragen. Danach liefert der Sammler Werte; bis dahin bleibt die Abnahme-Probe `stromlauf-kontingente` rot (gewollt: Done erst, wenn es läuft).

## Grenzen

- Gemessen werden nur Vercel-Deployments der letzten 24 Stunden (Plan-Limit 100 pro Tag als Konstante). Langfuse und Sentry folgen, sobald das Register ihre Projekte nennt.
- Der Sammler läuft noch nicht zeitgesteuert; Einbindung in `waechter.yml` ist offen.
