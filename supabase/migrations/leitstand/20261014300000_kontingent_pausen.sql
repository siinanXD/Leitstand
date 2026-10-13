-- SIN-581: Kontingent-Pausen zentral. Jedes Limit merkt sich seine Reset-Zeit, der Wecker stößt danach alles an. Nur additiv.
-- Geschrieben und gelesen von Workern und Wecker (service_role); RLS und Grants wie bei den übrigen Leitstand-Tabellen.

create table if not exists public.kontingent_pausen (
  id bigint generated always as identity primary key,
  dienst text not null check (dienst in ('claude', 'openai', 'anthropic_api', 'higgsfield', 'vercel_deploys', 'github_api', 'linear_api', 'langfuse')),
  bis timestamptz not null,
  grund text not null,
  repo text,
  erstellt_at timestamptz not null default now(),
  geweckt_at timestamptz
);

create index if not exists kontingent_pausen_offen on public.kontingent_pausen (dienst, bis) where geweckt_at is null;

alter table public.kontingent_pausen enable row level security;
alter table public.kontingent_pausen force row level security;

create policy kontingent_pausen_service on public.kontingent_pausen for all to service_role using (true) with check (true);

revoke all on public.kontingent_pausen from public, anon, authenticated;
revoke truncate, references, trigger on public.kontingent_pausen from service_role;

grant select, insert, update on public.kontingent_pausen to service_role;
