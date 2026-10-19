# SIN-754: Aktuellen Auftrag prüfen statt alten Spiegel nachbauen

Nutzerauftrag vom 19.10.2026: freigegebene Arbeit mit weniger manuellen Zwischenkorrekturen bis zum belegten Ergebnis führen. Vorhandene Loader-, Prüfer- und Hakenlogik erweitern; keine neue Agentenplattform oder Abhängigkeit.

- Dispatcher/Prüfer lesen Linear-Kommentare vollständig sowie Eltern- und erkannte Masteraufträge. Nicht erreichbare oder während des Lesens geänderte Quellen bleiben offen. Mastererkennung per Titel ist begrenzt; weitere relevante Bezüge muss der Worker gezielt lesen.
- Prüferergebnis an Head und Inhalts-Hash binden; aktuelle Kriterien einschließlich Nachträgen und bereits gesetzter Haken abgleichen. Nur Actions-Kommentare verwenden; alte Marker gelten nicht als abgeschlossen.
- Code-Lücke geht begrenzt zurück, fehlende Prüfung/Live-Abnahme bleibt In Review. Der bestehende Dispatcher prüft spätere Belege auch im Leitstand nach; unveränderte Ergebnisse nicht doppelt zählen. Keine zusätzlichen Modellaufrufe, Budgets, Zeitpläne oder Worker durch dieses Änderungspaket eingerichtet.
- Unabhängiger Review des ersten Heads fand fehlende Inhaltsprüfung, fehlenden Wiederaufnahmeweg nach Live-Erfolg und vorzeitig gesetzte Ergebnis-Marker. Korrektur: vorhandenen Proben-Runner gemeinsam nutzen, explizite issue/kriterium-Zuordnung aus dem gemergten Commit tatsächlich messen, beim bestehenden Dispatcher erneut lesen und Marker erst nach bestätigten Zustandsänderungen setzen. Keine Modell-URL als Live-Beweis verwenden; keine zusätzliche KI-Abnahme nach dem Deploy nötig.
- Die vertrauenswürdige Prüfer-Ausführung ist aus main integriert; Aktivierung erst nach unabhängiger Prüfung des kombinierten Stands mit [PR269](https://github.com/siinanXD/Leitstand/pull/269); Botautor allein ist keine vollständige Provenienz. SIN-638/PR275 bleibt zuständig für den CI-Reparaturzähler.

Kontrollfall: [SIN-830](https://linear.app/sinan-kahraman/issue/SIN-830) und [Lauf39219058277](https://github.com/siinanXD/Leitstand/actions/runs/39219058277): 72 Proben vollständig, 55 grün, danach Speicherfehler HTTP400. Detailregel und Grenzen: [AUFTRAGSABGLEICH](../autonomy/AUFTRAGSABGLEICH.md). Ein Dateicheck in docs/abnahme.yml ist nur Code-/Dokumentationsbeleg, keine ausgeführte Live-Abnahme.


## Übergabe nach begrenzter Nacharbeit am 19. Oktober

PR269 ist inzwischen als main-Commit 3fe7d97 integriert. Basis-Checkout, Install-Skriptsperre, validierte volle SHAs, lesender Diff ohne externe Filter, erneute Head-/Basisprüfung und getrennte Trockenlaufdatei bleiben erhalten. Der Auftragsabgleich ergänzt diesen sicheren Pfad.

Der unabhängige Abschlussreview auf bf43e7a meldet weiterhin P1-Befunde. Nach zwei gezielten Korrekturrunden bleibt PR291 Draft; keine weitere automatische Reparaturschleife und keine Aktivierung. Nächster abgegrenzter Arbeitsgang im selben PR:

- PR-Historie für wartende Issues vollständig paginieren; Gegenprobe mit mehr als dreißig neueren geschlossenen PRs.
- Bei Code-Lücken erst nach erfolgreichem Spiegel-Close nach Todo wechseln oder den Zwischenzustand explizit wiederaufnehmen; Gegenprobe mit temporärem GitHub-Fehler.
- Unabhängigen Prüfweg für nachträglich geänderte Kriterien/Live-Belege festlegen. Vorhandene unveränderte gebundene Prüfung plus echte Messung ist getestet; ein nachträglich geänderter Auftrag entwertet sie und braucht eine neue Prüfung. Der heutige Workflow bietet nach Merge keinen produktiven Nachprüfaufruf. Dafür keine geschlossenen PRs ungeprüft freischalten oder DRY_RUN umgehen.

Der weitere Inhalts-/Frischebefund referenziert den Vorgängerstand28736ee; die Pflicht samt Gegenprobe ist in bf43e7a bereits enthalten. Er wird nicht als unabhängige Freigabe ausgelegt. Vor Aktivierung ist ein neuer unabhängiger Review des integrierten endgültigen Heads erforderlich.
