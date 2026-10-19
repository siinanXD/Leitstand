# SIN-827: Prüfer vom Basis-Commit statt aus dem PR

Der bisherige Workflow führt PR-Code mit API- und Supabase-Secrets aus. Der Draft checkt stattdessen den Basis-Commit aus (`persist-credentials: false`) und installiert dessen Lockfile mit `--ignore-scripts`. PR-Metadaten werden über die GitHub-API validiert; nur offene Same-Repo-PRs von `claude/` und `codex/` sind zulässig. Drafts sind nur beim manuellen Trockenlauf zulässig. Explizite vollständige Basis-/Head-SHAs werden nur als Git-Objekte geladen, nie ausgecheckt. Diff liest ohne externe Diff-/Textconv-Helfer. Secrets sind auf die benötigten Schritte begrenzt.

Regressionsnachweis: isoliertes temporäres Git-Repo mit manipuliertem PR-Prüfskript und postinstall; beim Lesen des Diffs bleibt die Basis ausgecheckt und kein Marker wird ausgeführt. Die echte Workflow-Metadatenprüfung wird mit Claude, Codex, Fork, Draft, geschlossenem PR und ungültigen SHAs getestet.

Quelle, gelesen 18.10.2026: https://docs.github.com/en/actions/reference/security/secure-use . Keine neue Berechtigung, kein Secret geändert. API-Prüfung wird ausdrücklich als API statt Plus-/Max-Kontingent bezeichnet; interne Legacy-Reviewer-Kennungen bleiben für bestehende Ereignisse erhalten.

## Vor Wirksamwerden offen

- Kein Merge ohne Freigabe dieses Sicherheits-Drafts. Kein neuer bezahlter Modell-Lauf zur Prüfung ausgelöst. Echte Claude-/Codex-PR-Läufe nach Freigabe belegen.
- Branch-Protection-Lesen wurde vom Connector mit HTTP 403 abgewiesen. Ob `pruefen` ein erforderlicher Check ist, konnte nicht bestätigt werden. Dieser Draft ändert das Auto-Merge-Gate und Rulesets nicht; ein verpflichtendes Prüfer-Gate muss separat verifiziert und gegebenenfalls in diesem Issue ergänzt werden.
- Die Workflow-Datei selbst braucht weiterhin geschützte Reviews. Ein vertrauenswürdiger Checkout schützt nicht gegen einen berechtigten Angreifer, der auch den Workflow oder geschützte Basis-Commits verändern darf.
- Bestehender API-Fallback auf Anthropic und dessen unbekannte Kosten werden nicht aus einem Abo-Reset freigegeben. Kein Budget ausgeweitet; explizites Budget-/Fallback-Tracking bleibt ein weiterer Abnahmepunkt.

Die Datei-Probe in docs/abnahme.yml bestätigt nur den installierten Diff-Helfer. Sie ersetzt keine Live-Sicherheitsabnahme.

## Wiederaufnahme 19.10.2026 (SIN-834)

Die bisherige Freigabe für Commit 63e5eae ist im PR-Kommentar dokumentiert. main 824025b wurde ohne Verwerfen der parallelen Abnahme-Proben und Lehren integriert. Zusätzlich stoppt der Workflow vor dem Modell-Schritt, falls auf dem vertrauenswürdigen Basisstand der gehärtete Diff-Helfer noch fehlt: Der alte CLI ignorierte das neue Head-Argument und konnte einen leeren Basis-gegen-HEAD-Diff prüfen. Das wird beim erstmaligen Einführen ausdrücklich als nicht prüfbar behandelt.

Ruleset 24750459 konnte jetzt gelesen werden: aktiv, ausschließlich `build` erforderlich, keine Pull-Request-/Codeowner-Review-Regel und kein erforderlicher `pruefen`-Check. Die frühere 403-Ungewissheit gilt für diesen Ruleset-Befund nicht mehr. Kein Ruleset geändert. PR bleibt Draft bis unabhängigem Review, abgestimmtem Pflicht-Gate und ausdrücklicher Freigabe der zusätzlichen Bootstrap-Sicherung; bestehende Freigabe nicht auf neue Security-Logik ausdehnen.

Prüfung: Typecheck, Lint und 478 Tests nach Konfliktauflösung erfolgreich; anschließend alle sechs gezielten Security-Tests einschließlich Bootstrap-Sicherung erfolgreich. Kein Modellaufruf, kein API-Fallback-Test mit Kosten. GitHub-CI und Live-Negativprobe bleiben getrennte Abnahmestufen.

## Weitere Gegenproben 19.10.2026

Zwei Regressionen zunächst rot, danach grün:

- API-PR-Metadaten können nach einem neuen Push vom auslösenden Ereignis abweichen. Head und Basis müssen exakt dem Ereignis entsprechen; veraltete Ereignisse stoppen vor dem Modellschritt, statt ein Ergebnis für einen anderen Check-Commit zu erzeugen.
- Ein echter CLI-Trockenlauf in isoliertem Git-Repo mit gesperrtem Netz darf keine produktive Kommentar-Datei schreiben. Er erzeugt jetzt ausschließlich pruefer-trockenlauf.md mit ausdrücklichem Nicht-Abnahme-Hinweis. Der Workflow veröffentlicht damit keinen simulierten Erfolg als echtes Review.

Acht gezielte Sicherheitsprüfungen grün; Gesamtprüfung separat protokolliert. Kein Modellaufruf, keine Live-Secrets im Test. Dies sind zusätzliche Regressionen der implementierenden Work-Sitzung, kein unabhängiges Peer-Review.

## Konkret vorbereitete Schutzentscheidung (SIN-624)

Vor einer Aktivierung sind drei Voraussetzungen nötig:

1. Bestehenden Legacy-Branchschutz über eine bereits berechtigte Owner-Sitzung nur lesen und exportieren; der Connector liefert 403. Keine zusätzlichen Administrationsrechte an den Worker vergeben.
2. Autor-/Reviewer-Vertrauensgrenze trennen: Der aktuelle Autor siinanXD ist zugleich Codeowner, und das Worker-Token wird in Claude/Auto-Merge verwendet. Der Worker darf die menschliche Freigabe nicht mit derselben Identität selbst erteilen können. Eine weitere Review-Regel allein löst das nicht. Bestehende getrennte App-Identitäten zuerst nachweisen; Änderungen produktiver Token/Rechte brauchen konkrete Freigabe.
3. Erst dann bestehendes Ruleset additiv um unabhängige, Head-gebundene Prüfung und Owner-Freigabe für kritische Pfade ergänzen. build, Löschschutz, Non-Fast-Forward-Schutz und leere Bypass-Liste erhalten. Geskippter/fehlender Prüfer und ein Trockenlauf dürfen nicht als Review bestanden gelten. Neues Head invalidiert frühere Prüfung.

Abnahme vor Pilot: Workflow-PR ohne Ownerfreigabe blockiert; selbst vergebene Freigabe blockiert; veralteter/fremder Review blockiert; gültiger Review auf exaktem Head plus echte Freigabe erlaubt den regulären Weg; normaler risikoarmer PR bleibt ohne Gate-Umgehung abwickelbar. Keine dieser Produktivregeln wurde in dieser Sitzung geändert.


## Unabhängiger Review und Reparatur 19.10.2026

Codex-Review 5565478407 auf 9d2a1f2 bestätigte drei Lücken: PR-kontrollierte Workflowdefinition, nicht festgelegter vertrauenswürdiger Zielbranch und fehlendes Retargeting-Ereignis. Diese Runde bleibt ein vorbereiteter Draft, keine produktive Aktivierung.

Die Definition wird über `pull_request_target` aus dem Default-Branch geladen; nur `refs/heads/main` mit Default-Branch main ist zulässig. Vor Checkout, Installation und Zugriff auf Agent-/Modell-/Supabase-Secrets validiert github-script mit dem vorhandenen GITHUB_TOKEN den PR. Ausschließlich main als PR-Basis, GitHub-Branchmerkmal protected und identische vollständige SHAs für Workflow-Commit, aktuellen main und PR-Basis werden akzeptiert. Kein PR-Code wird ausgecheckt oder installiert. Bestehender Bootstrap-Stopp und ignore-scripts bleiben erhalten.

`edited` wird nur bei Basisänderungen verarbeitet. Ein solcher Wechsel entwertet vorhandene maschinelle Prüferkommentare auch dann, wenn der neue Zielbranch abgewiesen wird. Vor Veröffentlichung wird das Basis-/Head-Paar erneut aus der API gelesen; ein während des Modelllaufs überholtes Ergebnis wird nicht veröffentlicht. Der Ergebnistext nennt beide Commits. Fremde Kommentare werden bei der Entwertung nicht verändert.

Quelle, gelesen 19.10.2026: https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target . Die aktuelle GitHub-Dokumentation bindet den Trigger an den Default-Branch. Die dort beschriebene Event-Policy ist gesondert zu prüfen; keine Ausnahme oder Policy-Änderung vorgenommen. Der Triggerwechsel ist nach bestehenden Risiko-Regeln high und braucht konkrete Freigabe vor Wirksamwerden. Keine neuen Tokenrechte angefordert.

Grenzen: protected allein belegt keine ausreichende unabhängige Freigabe der Default-Branch-Änderungen. SIN-624 bleibt deshalb offen. Ein privilegierter Target-Workflow-Lauf ist außerdem kein Head-gebundener Pflichtstatus; diesen Check nicht ungeprüft als Required-Check hinzufügen. Bestehendes Gate/Review-Provenienz unter SIN-624/SIN-754 weiter absichern. Kein Modell-API-Lauf, kein produktiver Secret- oder Ruleset-Wechsel; echte negative Live-Proben erst nach Freigabe.

Regressionen zuerst rot (3 erwartete Fehler), anschließend gezielte Workflow-/Git-/CLI-Gegenproben grün. Gesamtprüfung und unabhängiger Folge-Review separat mit Head/Workflow-Lauf dokumentieren.

## Draft-Retargeting, 19.10.2026 morgens

Unabhängiger Folge-Review auf c7a4293: Die Job-Bedingung verhinderte bei Drafts die Entwertung alter Prüferkommentare. Basiswechsel erreichen jetzt den Job auch als Draft; die unveränderte Zielvalidierung stoppt anschließend vor Checkout, Installation und Modell-Secrets. Der always-Schritt entwertet den bisherigen Beleg. Normale Draft-Ereignisse, reine Titeländerungen und Forks bleiben ausgeschlossen. Regression wertet die tatsächliche Job-Bedingung mit positiven und negativen Ereignissen aus und prüft weiterhin die Draft-Sperre der Zielvalidierung; zuerst rot, nach Korrektur grün. Kein neuer Trigger, keine Rechte-/Secret-/Gate-Änderung; gesamter Sicherheits-Diff bleibt Draft zur unabhängigen Prüfung.
