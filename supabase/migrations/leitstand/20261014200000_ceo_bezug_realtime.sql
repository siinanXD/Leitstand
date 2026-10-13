-- SIN-579: Bezug der CEO-Entscheidung (Linear-Kennung) und Realtime für loop_snapshot und ceo_entscheidungen. Nur hinzufügen.
-- Tabellen, die es in der Umgebung noch nicht gibt, werden übersprungen.
alter table if exists public.ceo_entscheidungen add column if not exists bezug text;

do $$
declare t text;
begin
  foreach t in array array['loop_snapshot', 'ceo_entscheidungen'] loop
    if to_regclass('public.' || t) is not null
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
