-- SIN-637: Wirkung je Rollen-Ereignis. Zielerreichung 0 bis 1 (Kennzahl und Ziel stehen in docs/autonomy/agents.json). Nur additiv.
alter table public.loop_events add column if not exists wirkung numeric check (wirkung is null or (wirkung >= 0 and wirkung <= 1));
