-- SIN-1037: Struktur der Datenbank für /datenbank. Liest nur Katalog-Tabellen (information_schema, pg_*), nie Tabelleninhalte.
-- Aufruf nur mit service_role (API-Route /api/datenbank nach Sitzungsprüfung).
create or replace function public.leitstand_schema()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    'tabellen', coalesce((select jsonb_agg(jsonb_build_object('name', t.tablename, 'rls', t.rowsecurity)) from pg_catalog.pg_tables t where t.schemaname = 'public'), '[]'::jsonb),
    'spalten', coalesce((select jsonb_agg(jsonb_build_object('tabelle', c.table_name, 'name', c.column_name, 'typ', c.data_type, 'null', c.is_nullable = 'YES') order by c.table_name, c.ordinal_position) from information_schema.columns c where c.table_schema = 'public'), '[]'::jsonb),
    'schluessel', coalesce((select jsonb_agg(jsonb_build_object('tabelle', k.table_name, 'spalte', k.column_name, 'art', tc.constraint_type, 'ziel_tabelle', f.table_name, 'ziel_spalte', f.column_name))
      from information_schema.table_constraints tc
      join information_schema.key_column_usage k on k.constraint_name = tc.constraint_name and k.table_schema = tc.table_schema
      left join information_schema.constraint_column_usage f on tc.constraint_type = 'FOREIGN KEY' and f.constraint_name = tc.constraint_name and f.table_schema = tc.table_schema
      where tc.table_schema = 'public' and tc.constraint_type in ('PRIMARY KEY', 'FOREIGN KEY')), '[]'::jsonb),
    'policies', coalesce((select jsonb_agg(jsonb_build_object('tabelle', p.tablename, 'name', p.policyname)) from pg_catalog.pg_policies p where p.schemaname = 'public'), '[]'::jsonb),
    'realtime', coalesce((select jsonb_agg(r.tablename) from pg_catalog.pg_publication_tables r where r.pubname = 'supabase_realtime' and r.schemaname = 'public'), '[]'::jsonb)
  );
$$;

revoke all on function public.leitstand_schema() from public, anon, authenticated;
grant execute on function public.leitstand_schema() to service_role;
