# Externe Skills (SIN-738)

Gepinnte Kopien fremder Open-Source-Skills. Der Worker lädt sie über `docs/skills/frontend/SKILL.md` (Label `frontend`). Sinans Figma-Dateien bleiben die oberste Referenz; die Skills liefern Vokabular, nicht den Stil.

Regeln: Jedes Skill wird vor dem Einbau einmal gelesen (keine Netzwerkaufrufe, keine Secrets). Herkunft, Lizenz und Commit-Pin stehen hier. Ohne Pin wird nichts eingebaut.

| Ordner | Quelle | Lizenz | Commit-Pin | Label | Stand |
| --- | --- | --- | --- | --- | --- |
| `open-design/` | nexu-io/open-design (Hallmark, Anti-Slop, Design Critique, Design Engineering) | Apache-2.0 | offen | frontend | nicht eingebaut |
| `ui-ux-pro-max/` | nextlevelbuilder/ui-ux-pro-max-skill | MIT | offen | frontend | nicht eingebaut |
| `hallmark/` | nutlope/hallmark (zuerst auf Dublette zu open-design prüfen, dann nur eins behalten) | offen | offen | frontend | nicht eingebaut |
| `impeccable/` | pbakaus/impeccable | offen | offen | frontend | nicht eingebaut |
| `diagram-design/` | cathrynlavery/diagram-design | offen | offen | frontend | nicht eingebaut |
| `awesome-copilot-design/` | github/awesome-copilot (nur Design-System-Skills) | offen | offen | frontend | nicht eingebaut |
| `last30days/` | mvanhorn/last30days-skill (nicht doppelt zum Trend-Radar SIN-575) | offen | offen | research | nicht eingebaut |
| `humanizer/` | blader/humanizer (nur Content-Texte, nie Code-Kommentare) | offen | offen | content | nicht eingebaut |

Nicht aufnehmen: `senlindesign/taste-skill`, `D4Vinci/Scrapling`, REA, Ponytail.

Einbauen (je Zeile): Repo bei festem Commit klonen, `SKILL.md` und Hilfsdateien lesen, Lizenzdatei mitkopieren, Ordner anlegen, Pin und Lizenz in die Tabelle schreiben und „Stand“ auf „eingebaut“ setzen. Lizenz „offen“ heißt: vor dem Einbau prüfen, nur MIT oder Apache-2.0.
