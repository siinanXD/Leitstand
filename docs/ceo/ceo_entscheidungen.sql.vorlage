-- SIN-542: Entscheidungen des CEO-Agenten, eine Zeile pro Entscheidung. Nur additiv, nur hinzufügen (kein update, kein delete).
-- Schreiben nur service_role (Workflow ceo.yml). Lesen darf, wer in leitstand_nutzer steht (Karte „Der Chef sagt“).
-- Tabelle in public, aus demselben Grund wie leitstand_push_abos (PostgREST liefert nur freigegebene Schemas aus).

create table if not exists public.ceo_entscheidungen (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  produkt text not null,
  entscheidung text not null check (entscheidung in ('weiterbauen', 'reparieren', 'warten', 'fertig')),
  grund text not null,
  ausloeser text not null check (ausloeser in ('vorrat', 'bereitschaft', 'rot', 'taeglich')),
  dringend boolean not null default false,
  issue_url text
);

create index if not exists ceo_entscheidungen_produkt_zeit on public.ceo_entscheidungen (produkt, created_at desc);

alter table public.ceo_entscheidungen enable row level security;
alter table public.ceo_entscheidungen force row level security;

create policy ceo_entscheidungen_schreiben on public.ceo_entscheidungen for insert to service_role with check (true);
create policy ceo_entscheidungen_lesen_service on public.ceo_entscheidungen for select to service_role using (true);
create policy ceo_entscheidungen_lesen_nutzer on public.ceo_entscheidungen for select to authenticated using (exists (select 1 from public.leitstand_nutzer));

revoke all on public.ceo_entscheidungen from public, anon, authenticated;
grant select on public.ceo_entscheidungen to authenticated;
grant select, insert on public.ceo_entscheidungen to service_role;
