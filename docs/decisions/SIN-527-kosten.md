# SIN-527: Kosten-Datenschicht (heute, Monat, Budget)

- Quellen: `pipeline_run_costs` (Lern-App, Kurs-Inhalte), `werbemittel.kosten_eur` (Clips, Texte), Langfuse Daily Metrics (`GET /api/public/metrics/daily`, Basic Auth, USD).
- Fehlt eine Quelle (Umgebung fehlt, Fehler, Zeitüberschreitung), steht sie in `nichtVerfuegbar` und ihre Zeile hat `null`. Nie geschätzt.
- Doppelzählung: `pipeline_run_costs` ist das Ledger und gewinnt. Aus Langfuse zählt je Tag nur der Betrag über dem Ledger-Betrag desselben Tages (mindestens 0). Ist das Ledger nicht lesbar, gilt auch Langfuse als nicht verfügbar, statt doppelt zu zählen.
- Langfuse rechnet in USD. Umrechnung nur mit `KOSTEN_USD_EUR`; ohne den Kurs ist Langfuse nicht verfügbar.
- Budget `KOSTEN_BUDGET_EUR` (Standard 100). Balken grün < 70 %, gelb < 90 %, rot darüber. Push-Alarm (SIN-426): `kostenAlarm`, heute > 20 % des Budgets.
- Abos (Claude Max, Vercel …) werden nicht addiert, Hinweis „Abos nicht enthalten“.
- Annahmen (in diesem Repo nicht prüfbar, Langfuse-Docs und Lern-App-Schema waren im Lauf nicht abrufbar): `pipeline_run_costs` hat `created_at` und `cost_eur`; Daily Metrics liefert `data[].date`, `data[].totalCost` und `meta.totalPages`. Abweichungen nur in `lesePipeline` und `leseLangfuse` anpassen.

## Aufgabe für Sinan (Label `sinan`)

`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`, `KOSTEN_USD_EUR` (und optional `KOSTEN_BUDGET_EUR`) in Vercel eintragen.
