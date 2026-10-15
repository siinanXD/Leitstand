-- SIN-630: Wochenwerte der drei Kennzahlen als Zähler/Nenner. Nur additiv. Schreiben nur service_role (Messlauf), Lesen wer in leitstand_nutzer steht.
-- kennzahl: verkaufsfertig | kosten_je_einheit (zaehler = Euro, nenner = bestandene Einheiten) | fehlgeschlagene_aenderungen. woche = Montag (UTC).

create table if not exists public.kennzahlen_woche (
  produkt text not null,
  kennzahl text not null check (kennzahl in ('verkaufsfertig', 'kosten_je_einheit', 'fehlgeschlagene_aenderungen')),
  woche date not null,
  zaehler numeric not null check (zaehler >= 0),
  nenner numeric not null check (nenner >= 0),
  aktualisiert_at timestamptz not null default now(),
  primary key (produkt, kennzahl, woche)
);

alter table public.kennzahlen_woche enable row level security;
alter table public.kennzahlen_woche force row level security;

create policy kennzahlen_woche_lesen_service on public.kennzahlen_woche for select to service_role using (true);
create policy kennzahlen_woche_schreiben on public.kennzahlen_woche for insert to service_role with check (true);
create policy kennzahlen_woche_aendern on public.kennzahlen_woche for update to service_role using (true) with check (true);
create policy kennzahlen_woche_lesen_nutzer on public.kennzahlen_woche for select to authenticated using (exists (select 1 from public.leitstand_nutzer));

revoke all on public.kennzahlen_woche from public, anon, authenticated;
grant select on public.kennzahlen_woche to authenticated;
grant select, insert, update on public.kennzahlen_woche to service_role;
