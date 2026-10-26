# SIN-1053: native unabhängige Prüfung

Der zentrale Prüfer verwendet native Codex-Reviews. Die aktive CLI enthält keine Aufrufe an Modell-APIs und verlangt keine Modell-API-Schlüssel. Fehlende native Antworten führen zu einem wartenden Ergebnis ohne Freigabe-Marker. Timeout und Tagesdeckel lösen keinen automatischen Wiederholungsstart aus.

Ein Anstoß bindet Head, Prüfbasis und den bestehenden Hash des aktuellen Linear-Auftrags. Der Workflow serialisiert Anstöße mit `queue: max` (bis zu 100 wartende Läufe gemäß GitHub), damit parallele PRs die gemeinsame Tagesgrenze nicht gleichzeitig überschreiten. Gezählt werden die eigenen Anstoßkommentare in beiden unterstützten Repos seit UTC-Tagesbeginn; Standard ist 15. Pro Head erfolgt höchstens ein automatischer Anstoß. Ändert sich bei gleichem Head die Basis oder der Auftrag, bleibt die Prüfung gesperrt; eine bewusste neue Prüfung braucht einen neuen überprüfbaren Stand.

Nur `chatgpt-codex-connector[bot]` mit GitHub-Typ `Bot` zählt als native Quelle. Der aktuelle Zustand steht in der Praxis in einem vom Bot aktualisierten Issue-Kommentar; ergänzend werden PR-Reviews gelesen. Erstellzeit allein genügt bei aktualisierten Kommentaren nicht. Veraltete, verworfene und unvollständige Antworten werden abgewiesen.

Ein abgeschlossener Codereview ist kein Kriteriennachweis. Für einen gültigen Gesamtbeleg ist zusätzlich ein aktueller authentischer `codex-kriterien:v1`-Block erforderlich: Head, Basis, Auftragshash und Ergebnis mit `bestanden`, `funde` und `haken` nach dem vorhandenen Prüferschema. Dieser kann in einer separaten Bot-Antwort stehen. Fehlt er, wartet der Prüfer; aus einem bloßen „keine wichtigen Funde“ wird niemals ein gültiger Gesamtstand erzeugt. Die bisherige kanonische Kriterienauswertung und nachgelagerte Live-Abnahme bleiben erhalten.

Der bestehende Ziel-Guard, Checkout aus geschütztem main, Installation ohne Lifecycle-Skripte und erneute Head-/Basisprüfung direkt vor Veröffentlichung bleiben bestehen. Der Erstinstallations-Guard verlangt zusätzlich die native Implementierung auf der vertrauenswürdigen Basis. Produktcode wird weiterhin nur als Diff gelesen. Alte lokale Ergebnisdateien werden vor jedem Lauf entfernt, damit ein abgebrochener Lauf keinen früheren Erfolg veröffentlicht.

Ein Nachlauf prüft alle 15 Minuten, ob auf einen bestehenden aktuellen Request eine neue authentische Antwort eingetroffen ist. Nur dann wird die zentrale Prüfung erneut gelesen. Ein Fingerprint der tatsächlich gelesenen Bot-Antworten wird im offiziellen Ergebnis gespeichert; dessen Veröffentlichungszeit ist ausdrücklich kein Lesefortschritt. Auch Updates innerhalb derselben Sekunde verändern den Fingerprint. Drafts, `needs-human` und unbekannte Quellen bleiben ausgeschlossen. Der Nachlauf fordert keinen weiteren Codex-Review an.

## Aktivierung und Grenzen

Diese Änderung aktiviert sich nicht selbst. Bestehende Code-/Kriterien-/Risikogates bleiben verpflichtend. Native Reviews und Kriterienantworten sowie beide unterstützten Repos müssen nach Aktivierung getrennt live belegt werden. Die Datei-Abnahme ist ausschließlich ein Installationscheck.

Die getestete maschinenlesbare Kriterienantwort ist ein Auswertungsvertrag, kein Nachweis, dass der native Dienst sie für einen beliebigen Auftrag liefert. Die beobachtete Standard-Zusammenfassung enthält nur den Codereview-Status. Bei fehlendem Zugang zum Linear-Auftrag oder fehlender strukturierter Kriterienantwort bleibt der Gesamtbeleg offen. Die fehlgeschlagene ausführende Codex-for-Linear-Verbindung wird durch diesen Parser nicht repariert.

Queue-Semantik: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency .
