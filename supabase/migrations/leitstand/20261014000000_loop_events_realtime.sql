-- SIN-526: loop_events an Supabase Realtime anschließen (Einträge der Übersicht wandern ohne Neuladen). RLS bleibt unverändert.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'loop_events') then
    alter publication supabase_realtime add table public.loop_events;
  end if;
end $$;
