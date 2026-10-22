-- SIN-913: Agent-Testnutzer (nur lesen). Das Konto steht wie Sinan in leitstand_nutzer und sieht damit alle Seiten (bestehende Lese-Policies).
-- Das Konto trägt in app_metadata den Marker agent_testnutzer = true (beim Anlegen gesetzt). Restriktive Policies sperren Schreiben
-- nur für dieses Konto, und zwar auf jeder Tabelle im Schema public mit aktivem RLS, nicht nur auf leitstand_nutzer:
-- mit dem Sitzungs-Token kann das Konto die Datenbank auch an den API-Routen vorbei erreichen, deshalb muss die Sperre dort greifen.
-- Andere Rollen bleiben unberührt. Aktionen lehnt zusätzlich der Server mit 403 ab (src/lib/server-nutzer.ts). Nur additiv.
-- Policies greifen nur mit aktivem RLS. Alle Tabellen dieses Repos haben RLS (Test in migrationen.test.ts); Tabellen ohne RLS
-- nennt die Migration als Warnung, damit die Lücke im Migrations-Log sichtbar ist, statt stillschweigend offen zu bleiben.
-- shortcut: Tabellen, die später dazukommen, brauchen dieselben drei Policies; der Lauf ist wiederholbar (drop if exists).
do $$
declare
  t record;
  marker constant text := $m$(auth.jwt() -> 'app_metadata' ->> 'agent_testnutzer') is distinct from 'true'$m$;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  loop
    raise warning 'agent_testnutzer: Tabelle public.% hat kein RLS, Schreibsperre greift dort nicht', t.relname;
  end loop;
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
  loop
    execute format('drop policy if exists agent_testnutzer_kein_insert on public.%I', t.relname);
    execute format('drop policy if exists agent_testnutzer_kein_update on public.%I', t.relname);
    execute format('drop policy if exists agent_testnutzer_kein_delete on public.%I', t.relname);
    execute format('create policy agent_testnutzer_kein_insert on public.%I as restrictive for insert to authenticated with check (%s)', t.relname, marker);
    execute format('create policy agent_testnutzer_kein_update on public.%I as restrictive for update to authenticated using (%s)', t.relname, marker);
    execute format('create policy agent_testnutzer_kein_delete on public.%I as restrictive for delete to authenticated using (%s)', t.relname, marker);
  end loop;
end $$;
