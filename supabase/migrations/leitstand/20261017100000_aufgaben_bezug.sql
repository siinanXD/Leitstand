-- Fließband (SIN-814): Eltern- und verwandte Linear-Issues je Aufgabe, damit „repariert sich“ erkennbar ist. Nur hinzufügen.
alter table public.leitstand_aufgaben add column if not exists bezug text[] not null default '{}';
