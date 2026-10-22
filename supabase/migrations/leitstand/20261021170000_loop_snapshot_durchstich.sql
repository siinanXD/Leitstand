-- SIN-897: Tageswert der Kennzahl „Durchstich“ in loop_snapshot (Zeile leitstand). Nur hinzufügen.
-- durchstich: {"tag": "2026-10-20", "liste": ["SIN-1"], "quote": 0.5}, mit_eingriff: [{"kennung", "eingriffe"}], haengt: [{"kennung", "seitMin", "grund"}]
alter table public.loop_snapshot add column if not exists durchstich jsonb;
alter table public.loop_snapshot add column if not exists mit_eingriff jsonb;
alter table public.loop_snapshot add column if not exists haengt jsonb;
