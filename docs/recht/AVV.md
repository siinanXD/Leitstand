# AVV-Liste (SIN-552)

Jeder Dienst, der personenbezogene Daten bekommt, braucht einen Auftragsverarbeitungsvertrag (DSGVO Art. 28). Der monatliche Abgleich (`scripts/anwalt/anwalt.ts --avv`) prüft diese Liste gegen `package.json`, Workflows und Skripte.

Keine Rechtsberatung. Die Links stammen aus dem Wissensstand beim Anlegen und wurden nicht abgerufen; ob der Vertrag tatsächlich abgeschlossen ist, trägt Sinan ein.

| Dienst | Zweck | Daten | AVV-Link | Drittland | Abgeschlossen |
| --- | --- | --- | --- | --- | --- |
| Supabase | Datenbank, Login, Speicher (EU) | Konto, Ereignisse | https://supabase.com/legal/dpa | EU-Region; Konzern USA | offen (Sinan) |
| Vercel | Hosting | IP-Adressen, Logs | https://vercel.com/legal/dpa | USA | offen (Sinan) |
| Sentry | Fehlerberichte | IP, Fehlerkontext | https://sentry.io/legal/dpa/ | USA | offen (Sinan) |
| PostHog | Produktanalyse (nur mit Einwilligung, TDDDG § 25) | Nutzungsereignisse | https://posthog.com/dpa | EU-Cloud möglich | offen (Sinan) |
| Langfuse | KI-Beobachtung | Prompts, Antworten | https://langfuse.com/security/dpa | EU-Cloud möglich | offen (Sinan) |
| Anthropic | KI-Modell | Prompts ohne Personendaten | https://www.anthropic.com/legal/data-processing-addendum | USA | offen (Sinan) |
| OpenAI | KI-Modell | Prompts ohne Personendaten | https://openai.com/policies/data-processing-addendum/ | USA | offen (Sinan) |
| Higgsfield | Videoerzeugung | Clip-Prompts | AVV-Link fehlt, bei Higgsfield erfragen | unbekannt | offen (Sinan) |

## Offene Punkte

- Higgsfield: kein AVV-Link bekannt. Bis zur Klärung keine Personendaten an den Dienst.
- Drittlandtransfer (Art. 44 ff.): Angemessenheitsbeschluss oder Standardvertragsklauseln je US-Dienst von Sinan bestätigen lassen.
