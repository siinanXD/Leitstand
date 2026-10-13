# SIN-552: Anwalt-Agent

- Logik rein in `src/lib/anwalt/anwalt.ts` (getestet), Netz und Git in `scripts/anwalt/anwalt.ts`. Skill: `docs/skills/anwalt/SKILL.md`, AVV-Liste: `docs/recht/AVV.md`.
- Keine Rechtsberatung: Der Agent markiert und begründet, Sinan oder ein Anwalt entscheidet. Der Satz steht in jedem Kommentar. Zitiert wird nur aus amtlichen Quellen (DSGVO, BDSG, TDDDG, KI-VO Art. 50, DDG § 5).
- Feste Regeln auf hinzugefügten Zeilen, kein Modellaufruf: billig, wiederholbar, testbar. Rot (Tracking ohne Einwilligung, E-Mail im Prompt) setzt `needs-human` und verhindert damit Auto-Merge. Gelb und Grün kommentieren nur.
- Workflow: `docs/autonomy/anwalt.yml.vorlage` (PR-Prüfung und monatlicher AVV-Abgleich). Der Worker darf `.github/workflows/` nicht ändern.
- Werbemittel: `pruefeWerbemittel` prüft KI-Kennzeichnung, Fremdmarken, E-Mail-Adressen. `scripts/marketing/marketing.ts` ruft es vor dem Schreiben auf; ein Fehler bricht den Lauf ab, nichts landet als `wartet_auf_freigabe`.

## Lizenznachweis

| Quelle | Lizenz | Verwendung |
| --- | --- | --- |
| davila7/claude-code-templates, Skill `gdpr-dsgvo-expert` | MIT (laut Issue) | nur als Vorlage für die Prüfliste, kein Code übernommen |

Der Link aus dem Issue wurde beim Bauen nicht abgerufen.

## Aufgabe für Sinan (Label `sinan`)

1. `anwalt.yml` aus der Vorlage anlegen. Label `needs-human` muss existieren.
2. Spalte „Abgeschlossen“ in `docs/recht/AVV.md` füllen; AVV-Link für Higgsfield klären; Links prüfen.

## Ausgelassen

- Kachel „Recht“ auf der Übersicht: es gibt keine echten Daten dafür (kein `loop_events`-Eintrag), erfundene Zahlen sind verboten. Folgt, sobald der Workflow Ereignisse schreibt.
- Nicht geprüft: Lauf des Workflows, Abruf der AVV-Links und der Quell-Skill-Vorlage.
- Die Regeln sind Stichproben, keine vollständige Rechtsprüfung.
