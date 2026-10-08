# SIN-304: Supabase-Anbindung mit `@supabase/supabase-js`

- Entscheidung: Anmeldung (Magic-Link) und Lesen der Daten mit `@supabase/supabase-js`, Sitzung im Browser wie in der Lern-App (`src/lib/auth/browser-client.ts` dort).
- Belege: [supabase-js](https://github.com/supabase/supabase-js) MIT, rund 4,6k Sterne, aktiv gepflegt. Gleiche Version wie die Lern-App (`^2.117.2`).
- Verworfen: `@supabase/ssr` ([Repo](https://github.com/supabase/ssr), MIT, aber nur rund 207 Sterne, unter der Schwelle von 500). Eigene Cookie-Verwaltung ebenfalls verworfen (sicherheitskritisch).
- Annahme: Ein einzelner Nutzer (Sinan), keine serverseitig gerenderten, geschützten Daten nötig. Gelesen wird im Browser mit der Sitzung des Nutzers; RLS (`leitstand_nutzer`) schützt die Daten. Der Service-Role-Key kommt nie in den Browser.
- Folge: Reichen serverseitige Zugriffe später nicht mehr (z. B. Aktionen mit eigenem Token, SIN-304 Teil 3), kommt eine eigene Entscheidung dazu.
