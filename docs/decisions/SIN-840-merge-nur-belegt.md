# SIN-840: Merge nur mit aktuellen Kriterienbelegen

Quelle: https://linear.app/sinan-kahraman/issue/SIN-840 einschließlich Kommentar; SIN-754/638/830 samt Kommentaren und PR291/275 gelesen. PR269 ist als 3fe7d979 integriert. Keine neuen Rechte, Secrets, Rulesets oder Dienste.

## Verhalten

Automerge schaltet verzögertes GitHub-Auto-Merge aus. Erst bei grünem aktuellem Build liest merge-pruefen erneut Linear einschließlich paginierter Kommentare und Masterauftrag. Jeder aktuelle Haken, auch schon gesetzte und explizite Zusatzkriterien, braucht einen HTTPS-Beleg des unabhängigen Actions-Prüfers, gebunden an Head, Basis und Auftragsinhalt. Fehlende Prüfung, fehlende Kriterien, widersprüchliche Belege, alte Heads/Aufträge und Part-of sperren. Nachträge während des Lesens verwerfen das Ergebnis. Live-Proben stammen aus der vertrauenswürdigen Basis, niemals PR-Code mit Secrets ausführen. Nur danach SHA-gebundener Squash-Merge.

Fehlende Belege halten In Progress. Nicht mehr belegte Haken werden wieder geöffnet. Konkrete reparierbare Lücken gehen an bestehenden Auftrag/PR; fehlender Review oder Live-Beleg startet keinen blinden Neubau. Der Worker-Leser lädt auch verlinkte PRs und Register und gibt einen strukturierten Lauf-Marker aus. Prüferkommentare enthalten lesbares JSON.

Bestehender Reparatur-Draft275 ist eingerechnet. SIN-840 ersetzt dessen frühere Definition Erstversuch plus eine Reparatur: jetzt höchstens zwei erfolglose Reparaturrunden je Issue. Linear-Kommentare reservieren Runden vor Auslösung; PR-Wechsel setzt den Zähler nicht zurück. CI und Wächter verwenden denselben Einstieg, veraltete CI-Heads werden verworfen. needs-human bleibt bei roter CI im vorhandenen Push-Eingang sichtbar.

## Belege und Grenzen

Regressionen: merge-gate.test.ts, merge-cli.test.ts, automerge.test.ts, repair-cli.test.ts, worker-regeln.test.ts, auftrag.test.ts sowie bestehende Security-/Abschluss-/Wächter-Tests. Netz in CLI-Tests vollständig durch Fixtures ersetzt. Kein echter Worker-Lauf, echtes Test-Issue oder Live-Speichererfolg dadurch belegt.

Offen: unabhängige Prüfung des endgültigen kombinierten Heads, echte Prüfer-JSON-Ausgabe an einem PR, tatsächliches Worker-Laufprotokoll, kontrollierte Live-Stopp-/Push-Probe und SIN-830 mit 27 rollenbezogenen loop_events samt Ergebnislinks und sieben Tagen Wirkungszahlen. Codex-Nacharbeit geht an denselben Implementierer zurück; kein automatischer Wechsel zu Claude. Kein zusätzlicher Worker für SIN-830 gestartet.

Die ältere Post-Merge-Nachprüfung geänderter Kriterien bei bereits gemergten historischen PRs bleibt ein separat offener Befund aus291. Neue PRs sollen durch die vorgeschaltete Sperre gar nicht erst unbelegt gemergt werden. Kein unabhängiges Review und keine Live-Abnahme aus Unit-Tests ableiten. PR291/275 bleiben Draft und risk:high, kein Merge dieser Sitzung.
