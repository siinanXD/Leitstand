-- SIN-1049: Guthaben je Dienst (scripts/kontingent/sammler.ts, gelesen in /kosten). Nur hinzufügen.
alter table public.loop_snapshot add column if not exists guthaben jsonb;
