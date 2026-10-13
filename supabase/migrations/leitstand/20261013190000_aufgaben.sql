-- Titel und Stand der Linear-Aufgaben für den Leitstand (Sinan 13.10.: „Da steht nur ‚Eine Aufgabe‘“).
-- Nur hinzufügen. Füllt scripts/push/ausloeser.ts alle 15 Minuten aus Linear (service_role); lesen nur leitstand_nutzer.
create table if not exists public.leitstand_aufgaben (
  issue text primary key,
  titel text not null,
  projekt text,
  status text not null,
  gestartet_at timestamptz,
  fertig_at timestamptz,
  labels text[] not null default '{}',
  aktualisiert_at timestamptz not null default now()
);
alter table public.leitstand_aufgaben enable row level security;
revoke all on public.leitstand_aufgaben from anon;
grant select on public.leitstand_aufgaben to authenticated;
grant select, insert, update on public.leitstand_aufgaben to service_role;
create policy leitstand_aufgaben_lesen on public.leitstand_aufgaben for select to authenticated
  using (exists (select 1 from public.leitstand_nutzer n where n.user_id = auth.uid()));
