-- SIN-487: Grund, wenn Sinan ein Werbemittel ablehnt. Geht beim nächsten Lauf an den Agenten zurück. Nur additiv.
alter table public.werbemittel add column if not exists ablehnungsgrund text;
