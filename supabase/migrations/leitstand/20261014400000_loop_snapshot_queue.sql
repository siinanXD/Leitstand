-- SIN-572: Schlange des Leitstands als Zusammenfassung in loop_snapshot.
-- Form: {"todo": 0, "startable": 0, "in_progress": 0}
alter table public.loop_snapshot add column if not exists queue jsonb;
