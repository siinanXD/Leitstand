-- SIN-525: Kopplungscode für die Home-Bildschirm-App. Nur additiv.
-- Gespeichert wird nur ein Hash des Codes (HMAC), nie der Code selbst.
-- Nur service_role darf zugreifen (API-Routen); anon und authenticated haben keine Rechte (SIN-438: kein truncate, references, trigger).

create schema if not exists leitstand;

create table if not exists leitstand.kopplung (
  code_hash text primary key,
  token_hash text not null,
  ablauf timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists leitstand.kopplung_versuche (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

create index if not exists kopplung_versuche_created_at_idx on leitstand.kopplung_versuche (created_at);

alter table leitstand.kopplung enable row level security;
alter table leitstand.kopplung force row level security;
alter table leitstand.kopplung_versuche enable row level security;
alter table leitstand.kopplung_versuche force row level security;

-- Bewusst keine Policy für anon/authenticated: ohne Policy kommt nichts zurück.
create policy kopplung_service on leitstand.kopplung for all to service_role using (true) with check (true);
create policy kopplung_versuche_service on leitstand.kopplung_versuche for all to service_role using (true) with check (true);

revoke all on leitstand.kopplung, leitstand.kopplung_versuche from public, anon, authenticated;
revoke all on sequence leitstand.kopplung_versuche_id_seq from public, anon, authenticated;
revoke truncate, references, trigger on leitstand.kopplung, leitstand.kopplung_versuche from service_role;

grant usage on schema leitstand to service_role;
grant select, insert, delete on leitstand.kopplung, leitstand.kopplung_versuche to service_role;
grant usage on sequence leitstand.kopplung_versuche_id_seq to service_role;
