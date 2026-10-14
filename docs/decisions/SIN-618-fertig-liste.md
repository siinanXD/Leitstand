# SIN-618: Fertig-Liste Leitstand v1

- **Inhalt:** `docs/FERTIG.md` enthält die 25 Punkte aus dem Issue wörtlich (Vorschlag von Claude, von Sinan am 14.10.2026 beauftragt).
- **Haken:** Alle Punkte bleiben `[ ]`. Der Worker kann PR plus sichtbaren Nachweis (Snapshot, Screenshot, Lauf) nicht gegen die Live-Umgebung prüfen; nichts geraten (SIN-616 „Done heißt live“).
- **Belege:** Ein Haken kommt erst mit einer Zeile in dieser Tabelle (PR-Link und Nachweis).

| Punkt | PR | Nachweis |
| --- | --- | --- |
| (noch keiner) | | |

- **Zählung:** `fertig_v1`/`gesamt_v1` in `loop_snapshot.progress` zählt der Wächter aus den Haken (SIN-572): 0 von 25, sobald er das nächste Mal läuft. Das ist der Nachweis für „`loop_snapshot` zeigt `fertig_v1`/`gesamt_v1`“ und steht noch aus.
- **CEO:** Er legt aus offenen Punkten Issues an. Der Titel-Abgleich (`neueIssueTitel`) erkennt nur gleiche Titel. SIN-611 bis SIN-617 haben andere Titel; Sinan prüft beim ersten CEO-Lauf, ob zu „Alle Keys kommen aus Infisical per OIDC“ und „Rote Läufe mit Grund“ Dubletten entstehen.
