# SIN-855: Aufbauphase ohne feste Einspruchsfrist

Entscheidung Sinan, 19.10.2026, 22:41 Europe/Berlin. Ersetzt die Fristen aus SIN-812 (30 Min für `risk:medium`). Gleiche Regel wie in der Lern-App (Content-Agent-Lernapp#437, dort beim bestehenden Implementierer).

## Regel

- `risk:low` und `risk:medium`: Auto-Merge sofort nach grünem Pflicht-Check `build` und ohne Blocker, keine Zeitfrist. Die Risikoklasse bleibt: Workflow-Änderungen werden nicht auf low umetikettiert.
- Alte Marker `einspruch`, `einspruch:2h`, `einspruch:30m` und gespeicherte `bis`-Werte sperren nicht. Jeder Lauf von `automerge.yml` bewertet den PR neu, auch alte offene PRs (Label `unlabeled`/`synchronize`/Neuöffnen oder von Hand erneut starten).
- Unverändert gesperrt: `risk:high` ohne `freigegeben`, `no-automerge`, Draft, rote Pflicht-Checks, Secret-, Datenverlust- und Geldgrenzen.
- Tests, Sicherheitsprüfung, unabhängiges Review und Kriterienbelege entfallen nicht.
- Nach jedem Merge startet `dispatch.yml` sofort; ein Worker startet nur bei freiem Platz, Kontingent und startbarem Issue.
- Technik: `wartezeitMs` und `FRIST_MINUTEN` sind aus `scripts/loop/risiko.mjs` entfernt, `automerge.yml` wartet nicht mehr. Der historische Stationswert `einspruchsfrist` bleibt im API-/Typvertrag des Fließbands erhalten. Alte Einspruchslabels werden weiter eingelesen, routen Karten in der Aufbauphase aber nicht mehr in eine Wartestation. Bestehende Verbraucher und historische Daten behalten ihren Vertrag.

## Rückkehr zu Fristen

Erst nach separat dokumentierter, belegter Produktreife und Workflow-Abnahme. Kein automatischer Wechsel nach Datum oder Merge.

## Offen

### Integration vor dem Merge

`DRY_RUN=1 node scripts/loop/aufbauphase-probe.mjs` führt das wirkliche Skript aus
`automerge.yml` gegen simulierte GitHub-Antworten aus. Es prüft low/medium mit
Altlabels und gespeichertem Fristende 2099 sowie high, Freigabe, Draft, Stopplabel,
rote und laufende Pflichtchecks. Rotes `UNSTABLE` darf keinen Direkt-Merge auslösen.
CI und der stündliche Abnahme-Workflow erzeugen den Ergebnisbericht frisch;
`leitstand-aufbauphase-integration` liest ihn. Das ist ein ausführbarer
Integrationsnachweis, kein Beleg für einen echten Merge oder gültige Rulesets.

### Aktivierung nach dem Merge

Der echte Folge-PR kann erst das auf `main` aktivierte Gate belegen. Daher ist
dies ein gesonderter Aktivierungsnachweis, kein vorweg behaupteter Erfolg und
keine Aufforderung, Review oder Merge-Freigabe zu überspringen. SIN-855 bleibt
bis dahin In Progress/In Review. Nachtragen: Folge-PR-URL, Head-SHA, erfolgreicher
Auto-Merge-Run, erfolgreiche Pflichtcheck-Runs und Merge-Zeitpunkt. Zusätzlich
Ruleset auf `main` prüfen; die simulierten GitHub-Antworten ersetzen das nicht.

- Produkt-Code abgeglichen am 20.10.2026: `SJCODE-website` (`main`) und `stromlauf-ai` (`master`) haben bereits keine feste Frist. Beide `.github/workflows/pr-gate.yml` besitzen Blob-SHA `ac63d73b000425197b63fbeccb2d0a98c55c8386`: low/medium aktivieren Auto-Merge nach Pflichtchecks, high verlangt Owner-Freigabe am aktuellen Commit. Kein Änderungsauftrag zum Entfernen nicht vorhandener Timer. Actions-Aktivierung und Repo-Einstellungen sind damit noch nicht live geprüft.
- Beleg für „Done“: ein Folge-PR, der ohne Frist mergt (Head- und Run-Link im PR nachtragen). Code-Merge allein ist kein Done.
