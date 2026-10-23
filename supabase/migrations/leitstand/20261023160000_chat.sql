-- SIN-864: Datenbasis der Chatbubble. Zwei neue Tabellen, nur additiv; nur Sinan (Zeile in leitstand_nutzer) liest und schreibt.
-- Der Server schreibt Antworten und Aktionen mit service_role. Kein anon-Zugriff.
create table if not exists public.chat_nachrichten (
  id uuid primary key default gen_random_uuid(),
  faden uuid not null,
  rolle text not null check (rolle in ('sinan', 'leitstand')),
  text text not null check (length(text) > 0),
  bezug jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists chat_nachrichten_faden_idx on public.chat_nachrichten (faden, created_at);

create table if not exists public.chat_aktionen (
  id uuid primary key default gen_random_uuid(),
  nachricht_id uuid not null references public.chat_nachrichten (id) on delete cascade,
  aktion text not null check (aktion in ('antworten', 'kommentar', 'issue_anlegen', 'plan_vorschlagen', 'rueckfrage', 'bau_vorschlagen')),
  status text not null default 'geplant' check (status in ('geplant', 'ausgefuehrt', 'fehlgeschlagen', 'verworfen')),
  idempotenz_schluessel text not null unique,
  daten jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  ausgefuehrt_at timestamptz
);
create index if not exists chat_aktionen_nachricht_idx on public.chat_aktionen (nachricht_id);

alter table public.chat_nachrichten enable row level security;
alter table public.chat_aktionen enable row level security;
revoke all on public.chat_nachrichten, public.chat_aktionen from anon;
grant select, insert on public.chat_nachrichten to authenticated;
grant select, insert, update on public.chat_aktionen to authenticated;
grant select, insert, update on public.chat_nachrichten, public.chat_aktionen to service_role;

create policy chat_nachrichten_lesen on public.chat_nachrichten for select to authenticated
  using (exists (select 1 from public.leitstand_nutzer n where n.user_id = auth.uid()));
create policy chat_nachrichten_schreiben on public.chat_nachrichten for insert to authenticated
  with check (exists (select 1 from public.leitstand_nutzer n where n.user_id = auth.uid()));
create policy chat_aktionen_lesen on public.chat_aktionen for select to authenticated
  using (exists (select 1 from public.leitstand_nutzer n where n.user_id = auth.uid()));
create policy chat_aktionen_schreiben on public.chat_aktionen for insert to authenticated
  with check (exists (select 1 from public.leitstand_nutzer n where n.user_id = auth.uid()));
create policy chat_aktionen_aendern on public.chat_aktionen for update to authenticated
  using (exists (select 1 from public.leitstand_nutzer n where n.user_id = auth.uid()))
  with check (exists (select 1 from public.leitstand_nutzer n where n.user_id = auth.uid()));

do $$
declare
  t text;
begin
  foreach t in array array['chat_nachrichten', 'chat_aktionen'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
