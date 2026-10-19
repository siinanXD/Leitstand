# SIN-854: Aktueller Auftrag vor Merge

Der GitHub-Issue-Spiegel ist Startkontext. Prüfer und Gate lesen den aktuellen Linear-Auftrag nach Kennung im PR-Titel. Der Hash umfasst Kennung, Titel und vollständige Beschreibung einschließlich nummerierter Kriterien, Absätze und Code. Nur der Häkchen-Stand bleibt ohne Einfluss. Fehlende Quelle bedeutet kein Merge.

Nur eine bestandene echte Prüfung schreibt den Stand-Marker. Trockenläufe und fehlgeschlagene neue Prüfungen zählen nicht als Erfolg. Bei abweichendem Head oder Vertrag fordert das Gate eine neue unabhängige Prüfung aus dem geschützten main an. Während der Neubewertung bleibt Auto-Merge aus. Änderungen an Rechten und Freigaben werden damit nicht umgangen.

## Nachweise nach Phase

1. Vor Integration: Die CI führt den tatsächlichen Gate-Skriptkörper und Reparatur-CLI gegen isolierte GitHub-, Linear- und PostgREST-Fixtures aus. Alte Head-SHA, geänderte Linear-Kriterien, nicht lesbares Linear, zwei Reparaturen und providerübergreifender Stopp sind kontrolliert prüfbar. Es laufen keine Modellaufrufe und keine echten Reparaturstarts.
2. Nach Integration: Der gesonderte CI-Abnahme-Schritt auf main belegt dieselben Verhaltensproben. Die HTTP-Probe akzeptiert nur erfolgreiche main-Push-Läufe nach dem Korrekturauftrag; ältere Läufe zählen nicht. Diese Probe behauptet keine Live-Abnahme.
3. Im Betrieb: Für Done sind aktuelle unabhängige Review-Belege und echte Lauf-Links nötig. Die erste Integration kann noch keinen zukünftigen Lauf der neu aktivierten Gate-Version beweisen. Der externe Codex-Umgebungsfehler bleibt ein separater Blocker und wird nicht durch einen Providerwechsel umgangen.

Worker-PRs bekommen keine ausstehende GitHub-Auto-Merge-Freigabe. Nach aktuellem grünem Build liest das Gate Head, Labels, aktuellen Linear-Auftrag und bestandenen Prüfer-Stand erneut und versucht nur einen synchronen Squash-Merge mit exakt dieser SHA. Build-/Prüfer-Abschluss und authentisierte Prüfer-Kommentare lösen eine Neubewertung aus. Nicht zuordenbare Abschlussereignisse stoppen ohne Merge. GitHubs erforderliche Checks und Schutzregeln werden weder verändert noch umgangen.

Grenze: Linear und GitHub haben keine gemeinsame Transaktion. Ein Linear-Edit genau zwischen letzter Abfrage und der SHA-gebundenen Merge-Anfrage kann nicht atomar gesperrt werden. Die Änderung beseitigt das unbestimmte Zeitfenster einer früher aktivierten Auto-Merge-Freigabe; sie behauptet keine verteilte Transaktion.

## Merge-Prüfung von Done trennen

Der alte Prüfer-Prompt verlangte jede Live-Wirkung schon im Code-Diff und stufte jede sicherheitsrelevante Änderung pauschal hoch ein. Dadurch konnten auch korrekt geschützte Workflow-Änderungen keinen bestandenen Review erhalten.

Die Merge-Prüfung erzwingt jetzt für jeden unmarkierten Haken einen nichtleeren aktuellen Modellbeleg. Nur ein explizites Präfix `[nach Aktivierung] ` erlaubt eine spätere Live-Abnahme. Diese Haken werden im Code-Review zwingend als unbelegt ausgegeben, selbst wenn das Modell oder doppelte Einträge Erfolg behaupten. Der bestehende Done-Abgleich bleibt damit offen. Ohne Präfix bleibt auch ein Live-Kriterium vor dem Merge verpflichtend. Sicherheitsbefunde werden nie automatisch herabgestuft; der Prompt verlangt konkrete Risiken statt allein aus einer sicherheitsrelevanten Änderung einen Fehler abzuleiten. Risikoklassifizierer, High-Freigabe und Stopplabels bleiben unverändert.

Regressionen prüfen fehlende/fehlerhafte Pflichtbelege, unveränderte strenge Standardphase, offene und doppelte Live-Belege, Done-Sperre und echte Sicherheitsbefunde. Bestehender CI-Probenlauf prüft diese Tests. Die Reviewer-Version stammt weiterhin ausschließlich von main: Aktivierung und frische Reviews folgen erst nach separater Freigabe dieses Gate-PRs. Kein Review des PR-Heads mit produktiven Secrets.

Die Ausgabe übernimmt ausschließlich tatsächliche Auftragshaken. Der bestehende Done-Normalisierer wird wiederverwendet: gleichwertige Haken mit widersprüchlicher Phase sperren den Review und bleiben unbelegt. Die CI-Abnahme ist an `${GITHUB_SHA}` gebunden, damit ein älterer grüner main-Lauf nicht als Nachweis des neuen Prüfers zählt.

Lesendes Rückprüfen von Linear zeigte escaped eckige Klammern in der gespeicherten Markierung. Der Leser akzeptiert diese exakte Markdown-Darstellung ebenfalls; Regression prüft das tatsächliche Quellformat bis zum offenen Done-Abgleich. Kein freies Erraten von Phasen.
