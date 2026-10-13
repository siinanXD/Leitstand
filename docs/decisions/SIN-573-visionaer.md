# SIN-573: Visionär teilt Produkte in Versionen, der CEO stoppt bei „fertig“

- **Logik** rein in `src/lib/visionaer/visionaer.ts` (getestet), Netz in `scripts/visionaer/visionaer.ts`, Auftrag in `docs/skills/visionaer/SKILL.md`, Ausgabe nach `docs/schemas/visionaer.json` (`vorschlag` = `naechste_version` | `pause` | `abschliessen`).
- **Stand** steht als `loop_events`-Ereignis (Schritt `VERSION`, Status `pause` | `vorschlag` | `go` | `fertig`, Name und Schätzung im Feld `grund`), wie die Pause (SIN-530). Keine neue Tabelle, keine Migration. Der jüngste Eintrag je Produkt gilt.
- **CEO-Regel `fertig`:** Fertig-Liste 100 % und nichts rot (rot geht vor) → `fertig`. Ohne Version in Arbeit schreibt der CEO `VERSION pause` und startet `visionaer.yml`. Der Dispatcher (`scripts/loop/loop.ts`) startet nichts, solange der Leitstand-Stand `pause` oder `vorschlag` ist. Zweiter Lauf ohne „go“: wieder `fertig`, kein Auffüllen, Visionär nicht noch einmal gerufen. Mit `go` baut das Produkt wieder (`weiterbauen`).
- **Go:** Der Visionär schreibt `docs/VERSIONEN.md`-Abschnitt, Linear-Meilenstein `v2 <Name>` und verschiebt die genannten `idee`-Issues hinein; Stand `vorschlag`. Die Startseite fragt in der Chef-Zeile „Der Chef sagt: … Go?“. Der Knopf ruft `/api/version` (nur Sinan, nur wenn ein Vorschlag wartet) und schreibt `go`. Besteht die Version nur aus Fehlerbehebungen (`nur_fehler`), schreibt das Skript gleich `go`.
- **Eine offene Version je Produkt:** Das Skript lehnt eine neue ab, solange der Stand `vorschlag` oder `go` ist.
- **Fokus-Regel:** Hat ein Produkt `go` und ist der Stand jünger als 14 Tage, entscheidet der CEO für die anderen Produkte höchstens `reparieren`, sonst `warten`. „Fertig“ der Version (Stand `fertig`) hebt den Fokus auf.

## Aufgabe für Sinan (Label `sinan`)

Der Worker darf `.github/workflows/` nicht ändern:

1. `docs/visionaer/visionaer.yml.vorlage` nach `.github/workflows/visionaer.yml` kopieren. Der CEO braucht dafür Actions-Schreibrecht im `AGENT_WORKFLOW_TOKEN` (hat er für `planner.yml` schon).
2. Ohne diese Datei steht der Stand trotzdem auf `pause`: es wird nichts gebaut, bis ein Vorschlag mit „go“ vorliegt. Das steht als Warnung im CEO-Log.

## Ausgelassen

- **Release** (CHANGELOG-Abschnitt, Linear-Release, Marketing-Auslöser „Release“): Das Ende einer Version erkennt noch niemand (Stand `fertig` wird nirgends geschrieben). Eigenes Issue, sobald eine Version läuft.
- **Fokus beim Dispatcher:** Die Regel wirkt auf die Entscheidung des CEO (nichts Neues planen). Bereits startbare Issues anderer Produkte laufen weiter.
- **`docs/VERSIONEN.md` fremder Produkte:** Das Skript schreibt in `VERSIONEN_DIR` (Standard: dieses Repo). Für die Lern-App muss der Workflow deren Repo auschecken; nicht verdrahtet.
- Nicht geprüft: Linear-Aufrufe (`projectMilestoneCreate`, `issueUpdate` mit Kennung; nur nach der API-Dokumentation geschrieben), Lauf von `visionaer.yml`, PostHog-Kennzahlen (der Skill nennt sie, es gibt keine Quelle im Repo).
