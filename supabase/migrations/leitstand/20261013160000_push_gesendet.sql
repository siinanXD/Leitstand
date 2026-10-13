-- SIN-421: Was der Push-Auslöser schon gesendet hat (Schlüssel aus src/lib/push/ausloeser.ts), damit nichts doppelt kommt.
-- Nur hinzufügen. Wie leitstand_push_abos: RLS an und erzwungen, nur service_role (scripts/push/ausloeser.ts).
create table if not exists public.leitstand_push_gesendet (
  schluessel text primary key,
  gesendet_at timestamptz not null default now()
);
alter table public.leitstand_push_gesendet enable row level security;
alter table public.leitstand_push_gesendet force row level security;
revoke all on public.leitstand_push_gesendet from anon, authenticated;
grant select, insert, update on public.leitstand_push_gesendet to service_role;
