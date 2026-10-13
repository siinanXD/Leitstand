# SIN-550: Marketing-Agent

- Logik rein in `src/lib/marketing/marketing.ts` (getestet mit Fixture: 5 Ausgaben = 7 `werbemittel`-Zeilen), Netz in `scripts/marketing/marketing.ts`. Modell: `claude-haiku-5-5` (Standard „Haiku zuerst“, per `MARKETING_MODELL` änderbar). Die Modellantwort wird als Vertrauensgrenze geprüft; ist sie unvollständig, wird nichts geschrieben.
- Ausgaben je Lauf: 1 Landing-Page-Vorschlag, 3 Anzeigen (Google, Meta, LinkedIn mit Zielgruppe und Wochenbudget), 1 Lead-Magnet, 1 Clip-Auftrag für `werbeclip.yml` (SIN-520), 1 Metricool-Entwurf. Alle mit `status = wartet_auf_freigabe`, `mit_ki = true`.
- **Keine Schreibrechte nach außen:** Der Workflow hat weder Ad-Konto- noch Metricool-Token. Der Metricool-Entwurf ist nur Text; angelegt wird er später und nur über `createScheduledPostForReview`.
- Leitstand: Kachel „Werbung“ auf der Übersicht („3 Entwürfe warten“) führt zu `/freigabe/werbemittel`, wo Freigeben und Ablehnen schon laufen.
- Neue Arten in `werbemittel`: `landing_page`, `anzeige`, `lead_magnet`, `clip_auftrag`, `metricool_entwurf`.
- Skill-Paket: `docs/skills/marketing/` (8 Skills aus marketingskills, gekürzt, übersetzt, zugeschnitten).

## Lizenznachweis

| Quelle | Lizenz | Verwendung |
| --- | --- | --- |
| [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | MIT (laut Recherche im Issue, 54k Sterne) | 8 Skills inhaltlich übernommen und gekürzt, Quelle im Dateikopf |
| [thatrebeccarae/claude-marketing](https://github.com/thatrebeccarae/claude-marketing) | MIT (laut Issue) | nicht übernommen (unter der Sterne-Regel), nur als Vorlage vorgesehen |

**Nicht geprüft:** Die Lizenzdatei und der Urheberzeilen-Wortlaut von marketingskills konnten beim Bauen nicht abgerufen werden (kein Netz). Die Skills sind eigene, gekürzte deutsche Fassungen. Vor dem Merge: `LICENSE` von marketingskills als `docs/skills/marketing/LICENSE` einfügen (wie bei `docs/skills/ponytail/LICENSE`) und die Urheberzeile in die Dateiköpfe übernehmen.

## Aufgabe für Sinan (Label `sinan`)

1. `.github/workflows/marketing.yml` aus `docs/marketing/marketing.yml.vorlage` anlegen (der Worker darf `.github/workflows/` nicht ändern). Secret `ANTHROPIC_API_KEY` setzen.
2. `docs/marketing/werbemittel_arten.sql.vorlage` prüfen und über die Lern-App-CI einspielen (Tabelle gehört der Lern-App, siehe `SIN-405-supabase-schemas.md`). Bis dahin lehnt die Datenbank die neuen Arten ab, falls es eine Prüfregel auf `art` gibt.

## Ausgelassen

- Live-Eingaben: PostHog-Abfrage, `docs/PRODUCT.md` und Konkurrenz aus dem Feature-Agent werden noch nicht automatisch geholt. Das Skript liest eine JSON-Datei (`MARKETING_EINGABE`, Standard: Fixture). Anbinden, sobald PostHog-Zugang und Feature-Agent bereitstehen.
- Die Skill-Texte sind kein Wortlaut der Quelle.
