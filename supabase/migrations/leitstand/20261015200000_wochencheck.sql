-- SIN-631: Wochen-Check. Einstellungen (Push-Uhrzeit) und das Ergebnis je Sonntag; das Gedächtnis schreibt daraus Tage/<Datum>-wochencheck.md. Nur additiv.
-- Gelesen und geschrieben vom Server (service_role); RLS und Grants wie bei den übrigen Leitstand-Tabellen.

create table if not exists public.leitstand_einstellungen (
  schluessel text primary key,
  wert text not null,
  aktualisiert_at timestamptz not null default now()
);

create table if not exists public.leitstand_wochencheck (
  tag date primary key,
  notiz text not null,
  erstellt_at timestamptz not null default now()
);

alter table public.leitstand_einstellungen enable row level security;
alter table public.leitstand_einstellungen force row level security;
alter table public.leitstand_wochencheck enable row level security;
alter table public.leitstand_wochencheck force row level security;

create policy leitstand_einstellungen_service on public.leitstand_einstellungen for all to service_role using (true) with check (true);
create policy leitstand_wochencheck_service on public.leitstand_wochencheck for all to service_role using (true) with check (true);

revoke all on public.leitstand_einstellungen, public.leitstand_wochencheck from public, anon, authenticated;
revoke truncate, references, trigger on public.leitstand_einstellungen, public.leitstand_wochencheck from service_role;

grant select, insert, update on public.leitstand_einstellungen, public.leitstand_wochencheck to service_role;
