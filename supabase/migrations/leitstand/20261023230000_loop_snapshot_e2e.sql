-- SIN-1054: Kennzahl „Ende-zu-Ende“ in loop_snapshot (Zeile leitstand). Nur hinzufügen.
-- e2e: {"fenster_tage": 7, "gesamt": 12, "live": 9, "median_min": 190, "haengt_meist": "probe", "haengt": [{"kennung", "station"}], "stand": "ISO"}
alter table public.loop_snapshot add column if not exists e2e jsonb;
