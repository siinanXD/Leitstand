-- SIN-913: Agent-Testnutzer (nur lesen). Das Konto steht wie Sinan in leitstand_nutzer und sieht damit alle Seiten (bestehende Lese-Policies).
-- Das Konto trägt in app_metadata den Marker agent_testnutzer = true (beim Anlegen gesetzt). Restriktive Policies sperren Schreiben nur für dieses Konto; andere Rollen bleiben unberührt.
-- Aktionen lehnt zusätzlich der Server mit 403 ab (src/lib/server-nutzer.ts). Nur additiv; tut nichts, wenn die Tabelle fehlt.
do $$
begin
  if to_regclass('public.leitstand_nutzer') is not null then
    drop policy if exists agent_testnutzer_kein_insert on public.leitstand_nutzer;
    drop policy if exists agent_testnutzer_kein_update on public.leitstand_nutzer;
    drop policy if exists agent_testnutzer_kein_delete on public.leitstand_nutzer;
    create policy agent_testnutzer_kein_insert on public.leitstand_nutzer as restrictive for insert to authenticated
      with check ((auth.jwt() -> 'app_metadata' ->> 'agent_testnutzer') is distinct from 'true');
    create policy agent_testnutzer_kein_update on public.leitstand_nutzer as restrictive for update to authenticated
      using ((auth.jwt() -> 'app_metadata' ->> 'agent_testnutzer') is distinct from 'true');
    create policy agent_testnutzer_kein_delete on public.leitstand_nutzer as restrictive for delete to authenticated
      using ((auth.jwt() -> 'app_metadata' ->> 'agent_testnutzer') is distinct from 'true');
  end if;
end $$;
