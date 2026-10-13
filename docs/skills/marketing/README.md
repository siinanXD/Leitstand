<!-- Quelle: https://github.com/coreyhaines31/marketingskills (MIT). Die 8 Skills hier sind auf Deutsch gekürzt und auf unsere Produkte zugeschnitten (Bildungsträger, IHK-Ausbildung, Mittelstand). Lizenznachweis: docs/decisions/SIN-550-marketing-agent.md -->
# Skill-Paket Marketing (SIN-550)

Gilt für den Marketing-Agenten (`scripts/marketing/marketing.ts`) in Lern-App und Leitstand.

| Skill | Wofür |
| --- | --- |
| `ads/` | Anzeigen für Google, Meta, LinkedIn: Zielgruppe, Budget |
| `ad-creative/` | Überschriften und Texte je Plattform |
| `lead-magnets/` | Gratis-Material gegen Kontaktdaten |
| `analytics/` | Kennzahlen lesen, ohne zu raten |
| `copywriting/` | Texte für Landing-Page und Beiträge |
| `cro/` | Landing-Page verbessern |
| `launch/` | Neue Funktion bekannt machen |
| `video/` | Clip-Aufträge für `werbeclip.yml` |

Harte Regeln für alle Skills:

1. Nichts wird veröffentlicht oder geschaltet. Jede Ausgabe wartet in `werbemittel` auf Sinans Freigabe.
2. Kein Zugriff auf Ad-Konten. Metricool nur als Entwurf (`createScheduledPostForReview`), nie direkt posten.
3. Keine erfundenen Zahlen, Belege, Kundenstimmen oder Preise. Unsicheres mit „[prüfen]“ markieren.
4. KI-Inhalte sind gekennzeichnet („mit KI erstellt“).
5. Keine Personendaten in Prompts.
