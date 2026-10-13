# SIN-542: CEO-Agent entscheidet je Produkt, was als Nächstes gebaut wird

- Reine Entscheidung in `src/lib/ceo/ceo.ts` (getestet, Fixture mit allen 4 Arten), Netz in `scripts/ceo/ceo.ts`. Je Produkt genau eins von `weiterbauen`, `reparieren`, `warten`, `fertig`. Reihenfolge: Rot (dann `dringend`), v1 fertig, Vorrat ≥ 3 reicht, `warten` nur bei 0 startbaren Issues und offener Aufgabe für Sinan, sonst `weiterbauen` und auf höchstens 8 auffüllen.
- **Modell: keins.** Die Regeln sind eindeutig und stehen im Code; ein Modell wäre teurer und weniger nachvollziehbar. „Haiku zuerst“ gilt, sobald ein Schritt echtes Urteil braucht (z. B. die Lücke in der Fertig-Liste benennen). Dann hier nachtragen.
- Startbar = Linear-Zeile im Status Todo mit Label `claude`, ohne Blocker und ohne `sinan`, `needs-human`, `design`. Gelesen wird `loop_snapshot` (die Spalte `queue.startable` gibt es noch nicht).
- Auslöser (`CEO_AUSLOESER`): `vorrat`, `bereitschaft`, `rot`, `taeglich`. Bei `vorrat` und `bereitschaft` schreibt der CEO nur, wenn er etwas zu planen hat oder nicht weiterbaut.
- Schreibt: Zeile in `ceo_entscheidungen` (nur hinzufügen) und in `loop_events` das Ereignis `step = ceo`, `status = rolle_gestartet`. Eine Spalte `event_type` gibt es in `loop_events` nicht; den Grund trägt `ceo_entscheidungen.ausloeser`.
- Regeln werden als Felder ausgegeben (`metaErlaubt`: höchstens 1 Loop-/Meta-PR pro Tag, `ideenErlaubt`: v1 fertig und höchstens 1 Idee pro Woche). Der Planer und die Wächter lesen sie noch nicht.
- Karte „Der Chef sagt“ auf der Übersicht liest die letzte Zeile je Produkt. Fehlt die Tabelle, steht dort „Noch keine Entscheidung“.
- Migration: `ceo_entscheidungen` in eigenem PR, nach „Freigeben“ von der Lern-App-CI einspielen (siehe `SIN-405-supabase-schemas.md`).

## Aufgabe für Sinan (Label `sinan`)

`.github/workflows/ceo.yml` aus `docs/ceo/ceo.yml.vorlage` anlegen (der Worker darf `.github/workflows/` nicht ändern). `docs/product-readiness.json` und `post-merge.yml` gibt es noch nicht; bis dahin löst `loop-merge` aus und der Pfadfilter greift nicht.
