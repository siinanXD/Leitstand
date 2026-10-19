-- SIN-832: dauerhafte issueweite Reservierung und providerübergreifender Reparaturzähler. Nur hinzufügen.
-- Vorhandene Tabelle leitstand_aufgaben (Zeile je Linear-Issue). Der Aufgaben-Spiegel (scripts/push/ausloeser.ts)
-- schreibt diese Spalten nie; sein Upsert lässt sie unverändert.
-- Compare-and-swap: UPDATE … WHERE issue = $1 AND claim_revision = $alt (src/lib/loop/reservierung.ts).
alter table public.leitstand_aufgaben add column if not exists claim_revision integer not null default 0 check (claim_revision >= 0);
alter table public.leitstand_aufgaben add column if not exists claim_provider text check (claim_provider is null or claim_provider in ('claude', 'codex'));
alter table public.leitstand_aufgaben add column if not exists claim_id text;
alter table public.leitstand_aufgaben add column if not exists claim_at timestamptz;
alter table public.leitstand_aufgaben add column if not exists reparaturen integer not null default 0 check (reparaturen >= 0);
alter table public.leitstand_aufgaben add column if not exists claim_nachweis text;
