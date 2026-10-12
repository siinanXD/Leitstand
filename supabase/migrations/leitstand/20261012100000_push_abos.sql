-- SIN-425: Push-Abos für Mitteilungen aufs Handy. Nur additiv.
-- Nur service_role darf zugreifen (API-Routen prüfen vorher Sitzung und leitstand_nutzer); anon und authenticated haben keine Rechte (SIN-438: kein truncate, references, trigger).
-- Tabelle in public, aus demselben Grund wie leitstand_kopplung (PostgREST liefert nur freigegebene Schemas aus).

create table if not exists public.leitstand_push_abos (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.leitstand_push_abos enable row level security;
alter table public.leitstand_push_abos force row level security;

-- Bewusst keine Policy für anon/authenticated: ohne Policy kommt nichts zurück.
create policy leitstand_push_abos_service on public.leitstand_push_abos for all to service_role using (true) with check (true);

revoke all on public.leitstand_push_abos from public, anon, authenticated;
revoke truncate, references, trigger on public.leitstand_push_abos from service_role;

grant select, insert, update, delete on public.leitstand_push_abos to service_role;
