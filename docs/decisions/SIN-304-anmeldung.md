# SIN-304 Teil 2: Anmeldung und Übersicht

- Entscheidung: Magic-Link per `signInWithOtp` mit `shouldCreateUser: false`, Sitzung im Browser über `@supabase/supabase-js` (siehe `SIN-304-supabase-js.md`). Kein `@supabase/ssr`, keine Cookies, kein Proxy.
- Schutz: clientseitig. Ohne Sitzung leitet `useSitzung` (`src/lib/sitzung.ts`) auf `/anmelden`, nach der Anmeldung zurück auf `/`. Die Daten schützt RLS (`leitstand_nutzer`); ohne Sitzung kommen keine Zeilen zurück.
- Lesen: `ladeQuelle` fragt `loop_events` (24 h) und `loop_snapshot` mit der Sitzung des Nutzers ab. Der frühere serverseitige Abruf mit dem Anon-Key entfällt (er sah wegen RLS nichts).
- Fehlermeldung bei der Anmeldung ist immer gleich, damit unbekannte Adressen nicht erkennbar sind.
- Annahme: Der Magic-Link nutzt den Standard-Ablauf von supabase-js; `/auth/callback` unterstützt zusätzlich `?code=`. Unter Authentication → URL Configuration muss `https://leitstand-one.vercel.app` stehen.
- Figma war nicht erreichbar. Das Layout folgt der Beschreibung im Issue und den Tokens aus `globals.css`; Abgleich mit Frame `10:3` steht aus.
- Offen: Die „LIVE“-Anzeige fehlt bewusst (Realtime ist nicht Teil dieses Issues); die Kopfzeile zeigt „Stand“ mit der Ladezeit.
