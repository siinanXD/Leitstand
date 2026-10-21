-- SIN-904: Stand-Prüfung schreibt bei Abweichung status needs_human (UI liest es als „wartet“). Check additiv um diesen Wert erweitert.
alter table public.loop_events drop constraint if exists loop_events_status_check;
alter table public.loop_events add constraint loop_events_status_check check (status in ('start', 'ok', 'fehler', 'uebersprungen', 'needs_human'));
