-- SIN-525: Kopplungscode für die Home-Bildschirm-App. Nur additiv.
-- Gespeichert wird nur ein Hash des Codes (HMAC), nie der Code selbst.
-- Nur service_role darf zugreifen (API-Routen); anon und authenticated haben keine Rechte (SIN-438: kein truncate, references, trigger).

-- Tabellen in public (nicht im Schema `leitstand`): PostgREST liefert nur freigegebene Schemas aus, und das Schema
-- `leitstand` ist dort nicht eingetragen. Zugriff bleibt durch RLS und fehlende Rechte auf service_role beschränkt.

create table if not exists public.leitstand_kopplung (
  code_hash text primary key,
  token_hash text not null,
  ablauf timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.leitstand_kopplung_versuche (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

create index if not exists leitstand_kopplung_versuche_created_at_idx on public.leitstand_kopplung_versuche (created_at);

alter table public.leitstand_kopplung enable row level security;
alter table public.leitstand_kopplung force row level security;
alter table public.leitstand_kopplung_versuche enable row level security;
alter table public.leitstand_kopplung_versuche force row level security;

-- Bewusst keine Policy für anon/authenticated: ohne Policy kommt nichts zurück.
create policy leitstand_kopplung_service on public.leitstand_kopplung for all to service_role using (true) with check (true);
create policy leitstand_kopplung_versuche_service on public.leitstand_kopplung_versuche for all to service_role using (true) with check (true);

revoke all on public.leitstand_kopplung, public.leitstand_kopplung_versuche from public, anon, authenticated;
revoke all on sequence public.leitstand_kopplung_versuche_id_seq from public, anon, authenticated;
revoke truncate, references, trigger on public.leitstand_kopplung, public.leitstand_kopplung_versuche from service_role;

grant select, insert, delete on public.leitstand_kopplung, public.leitstand_kopplung_versuche to service_role;
grant usage on sequence public.leitstand_kopplung_versuche_id_seq to service_role;
