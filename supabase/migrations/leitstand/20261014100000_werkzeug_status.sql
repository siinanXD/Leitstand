-- SIN-544: Status der Werkzeuge (Sentry, PostHog, Langfuse, …). Nur additiv.
-- Geschrieben vom Prüfskript (service_role), gelesen über /api/werkzeuge nach Sitzungs- und leitstand_nutzer-Prüfung.

create table if not exists public.leitstand_werkzeug_status (
  id text primary key,
  ok boolean not null,
  hinweis text,
  geprueft_at timestamptz not null default now(),
  letzte_ok_at timestamptz
);

alter table public.leitstand_werkzeug_status enable row level security;
alter table public.leitstand_werkzeug_status force row level security;

create policy leitstand_werkzeug_status_service on public.leitstand_werkzeug_status for all to service_role using (true) with check (true);

revoke all on public.leitstand_werkzeug_status from public, anon, authenticated;
revoke truncate, references, trigger on public.leitstand_werkzeug_status from service_role;

grant select, insert, update on public.leitstand_werkzeug_status to service_role;
