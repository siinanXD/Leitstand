-- SIN-913: Agent-Testnutzer (nur lesen). Das Konto steht wie Sinan in leitstand_nutzer und sieht damit alle Seiten (bestehende Lese-Policies).
-- Schreiben bekommt niemand über die Sitzung: leitstand_nutzer selbst ist für authenticated nur lesbar, Aktionen lehnt der Server mit 403 ab (src/lib/server-nutzer.ts).
-- Nur additiv; tut nichts, wenn die Tabelle in diesem Projekt fehlt.
do $$
begin
  if to_regclass('public.leitstand_nutzer') is not null then
    revoke insert, update, delete on public.leitstand_nutzer from authenticated, anon;
  end if;
end $$;
