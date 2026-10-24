-- SIN-1073: Kennzahlen der E2E-Strecke in loop_snapshot (Zeile leitstand). Nur hinzufügen.
alter table public.loop_snapshot add column if not exists e2e jsonb;
