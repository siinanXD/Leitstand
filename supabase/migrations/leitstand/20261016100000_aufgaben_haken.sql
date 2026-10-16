-- Fertig-Kriterien je Linear-Issue (SIN-754): „3 von 5 Haken“ an der Aufgaben-Karte. Nur hinzufügen.
alter table public.leitstand_aufgaben add column if not exists haken_gesamt integer;
alter table public.leitstand_aufgaben add column if not exists haken_erledigt integer;
