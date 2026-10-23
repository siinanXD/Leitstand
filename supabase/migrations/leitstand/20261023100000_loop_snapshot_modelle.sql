-- SIN-942: Wochenmessung je Rolle und Modell (scripts/kennzahlen/modelle.ts). Nur hinzufügen.
alter table public.loop_snapshot add column if not exists modelle jsonb;
