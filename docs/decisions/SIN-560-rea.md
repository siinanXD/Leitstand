# SIN-560: REA als Werkzeug für den Prüfer

## Entscheidung

REA (Reverse Engineer Anything, `morluto/rea`, MIT) wird **kein eigener Agent**, sondern ein Werkzeug, das Sinan im Chat oder auf dem eigenen Rechner für Datenfluss-Prüfungen nutzt. Es kommt nicht ins Repo und nicht in `package.json`.

## Lizenz

MIT, Nutzung und Weitergabe frei. Zusätzlich gelten die Nutzungsbedingungen von REA: nur Software, die uns gehört oder die wir untersuchen dürfen. Lizenztext vor dem ersten Einsatz in der Quelle prüfen (Stand der Idee: 13.10.2026, nicht abgerufen).

## Grenzen

- Nur eigene Apps: Lern-App (`siinanXD/Content-Agent-Lernapp`) und Leitstand. **Keine Konkurrenz-Apps**, auch nicht „nur zum Ansehen“.
- Der Anwalt-Agent (SIN-552) prüft jeden Einsatz vorher. Ohne seine Freigabe kein Lauf.
- Läuft nicht in GitHub Actions (braucht lokal Ghidra, Browser, adb). Kein Workflow, kein Docker.
- Mitschnitte enthalten Tokens und Personendaten. Rohdaten nie ins Repo und nie in Prompts; in den Bericht kommen nur Ziel-Domain, Datenart und Zweck, ohne Werte.

## Einsätze (eigene Apps)

1. **Netzwerk-Mitschnitt** (HAR/mitmproxy): welche Daten gehen an welche Dienste. Ergebnis als Bericht `docs/recht/datenfluesse-<datum>.md` (Vorlage: `docs/recht/datenfluesse-vorlage.md`); jeder Dienst wird mit `docs/recht/AVV.md` abgeglichen, fehlende Zeilen als offener Punkt eintragen.
2. **PWA-/Bundle-Analyse:** eingebettete Geheimnisse oder Personendaten im JS-Bundle.
3. **SQLite/IndexedDB** der Offline-Funktion: was liegt auf dem Gerät.

## Offen

- **Erster Lauf auf der Lern-App steht aus.** Der Worker kann REA nicht ausführen (kein lokales Werkzeug, kein Zugang zur laufenden App) und erfindet keinen Bericht. Sinan führt den Lauf aus und füllt die Vorlage als `docs/recht/datenfluesse-<datum>.md`; erst dann ist SIN-560 vollständig erfüllt. Label `sinan`.
