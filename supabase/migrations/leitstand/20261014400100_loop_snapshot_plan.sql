-- SIN-553: Plan des Vorarbeiters in loop_snapshot.
alter table public.loop_snapshot add column if not exists plan jsonb;
