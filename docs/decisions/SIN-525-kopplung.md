# SIN-525: Handy-App koppeln per 6-stelligem Kopplungscode

- Problem: Link aus der Mail lässt sich in Sinans Mail-App nicht kopieren, ein Code in der Mail geht ohne eigenes SMTP nicht (siehe `SIN-510-code-anmeldung.md`). Die Home-Bildschirm-App hat einen eigenen Speicher.
- Entscheidung: Kopplung aus einer Sitzung, in der Sinan schon angemeldet ist (Desktop oder Safari).
  1. Knopf „Handy-App anmelden“ (`src/app/kopplung.tsx`) auf `/auth/callback` nach dem Login und unter `/einstellungen`. `POST /api/kopplung` (Sitzung + `leitstand_nutzer`) erzeugt mit `auth.admin.generateLink({ type: 'magiclink', email })` den `hashed_token` und speichert HMAC-Hash des Codes, `hashed_token` und Ablauf (10 Minuten).
  2. `/anmelden`, Feld „Kopplungscode“: `POST /api/kopplung/einloesen` tauscht den Code gegen `token_hash` (Zeile wird dabei atomar gelöscht, also einmal nutzbar). Der Client ruft `verifyOtp({ token_hash, type: 'magiclink' })`.
- Schutz: Jeder Versuch wird vor der Prüfung gezählt (parallele Anfragen umgehen die Sperre nicht). Ab dem 6. Versuch in 10 Minuten antwortet der Server mit 429, auch bei richtigem Code; ein Erfolg nimmt seinen Versuch wieder heraus. Die Sperre gilt global, nicht je Absender (es gibt nur einen Nutzer, der Endpunkt hat keine Sitzung). Nachteil: Wer rät, kann Sinan 10 Minuten aussperren; neue Codes entstehen trotzdem, einlösen geht erst nach dem Fenster.
- Ereignisse: jede Kopplung (ok, fehler, gesperrt) als `loop_events` mit Projekt `leitstand`, Schritt `kopplung`.
- Migration: `supabase/migrations/leitstand/20261012000000_kopplung.sql`, nur additiv (Schema `leitstand`, Tabellen `kopplung`, `kopplung_versuche`). RLS an und erzwungen, keine Rechte für `anon`/`authenticated`, `service_role` nur `select, insert, delete` (kein `truncate`, `references`, `trigger`, SIN-438).

## Aufgabe für Sinan (Label `sinan`)

Die Migration wird von der Lern-App-CI ausgeführt (siehe `SIN-405-supabase-schemas.md`). Danach in Supabase unter Settings → API → „Exposed schemas“ `leitstand` freigeben, sonst erreicht `service_role` die Tabellen nicht über die Data API.
