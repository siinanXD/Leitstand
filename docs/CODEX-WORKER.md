# Aufgaben an den Codex-Worker übergeben (SIN-832)

Claude und andere bestehende Agenten dürfen risikoarme, abgegrenzte Aufgaben an den ChatGPT/Codex-Worker übergeben. Sinan muss diese Arbeit nicht einzeln freigeben. Genau ein Worker implementiert ein Issue; der andere darf unabhängig prüfen.

## Auslöser und Grenzen

Der eingerichtete GitHub-Ereignis-Auslöser nimmt einen **neu geöffneten Draft-PR** in `siinanXD/Leitstand` an, wenn:

- der PR-Autor `siinanXD` ist und der Head-Branch im selben Repository liegt;
- der Titel bereits beim Öffnen `[codex-worker]` enthält;
- der PR ein konkretes Linear-Issue und eine Briefdatei verlinkt.

Beispiel: `docs(worker): Übergabeprotokoll [codex-worker] (SIN-832)`.

Der Auslöser ist außerhalb der GitHub-Actions-Workflows eingerichtet. Er startet eine Worker-Sitzung mit den verbundenen GitHub-/Linear-Zugängen. Seine Konfiguration allein belegt keinen erfolgreichen Arbeitslauf. Es gibt keine zugesicherte Startzeit; ein fehlender Claim bleibt als offener Übergabestatus sichtbar.

Direkte Linear-Ereignisse werden in diesem Rollout nicht unterstützt. Das bloße Setzen eines Labels, eine Titeländerung an einem bestehenden PR oder ein Kommentar startet diesen Übergabeweg nicht. Die produktive Planer-/Dispatcher-Auswahl bleibt unverändert: Der Pilot verteilt noch nicht automatisch Aufgaben zwischen Claude und Codex.

## Übergabe durch den bisherigen Worker

1. Linear-Issue und offene PRs prüfen. Bei laufender Umsetzung durch einen anderen Worker keine zweite beginnen. Übergabe und bisherigen Stand im Issue vermerken. Keine zusätzliche Claude-Auslösung für diesen Auftrag erzeugen; vorhandene Label-/Berechtigungsregeln bleiben bestehen.
2. Einen eigenen Branch `codex/auftrag-sin-<nummer>` vom aktuellen `main` anlegen. Keine konkurrierenden Änderungen am bisherigen Arbeitsbranch vornehmen.
3. `docs/autonomy/auftraege/SIN-<nummer>.md` mit dem Auftrag committen (`Part of SIN-<nummer>`). Der Brief enthält Ziel, betroffene Dateien, Fertig-Kriterien, passende Prüfungen, Nicht-Ziele und bekannte Blocker. Keine Secrets oder Personendaten eintragen.
4. Den Draft-PR mit Titelmarker öffnen. Im Body Linear-Link und Briefpfad nennen. Bestehende Agenten können dazu ihre vorhandenen GitHub-Werkzeuge nutzen; es wird kein zusätzliches Token verlangt.
5. Die Umsetzung abgeben. Nicht gleichzeitig einen Claude-Auftrag für dasselbe Issue starten. Ohne Startbeleg keine zweite Übergabe auf Verdacht öffnen.

## Übernahme und Abschluss durch Codex

1. PR, aktuellen Head-Commit, Kommentare und Linear-Issue erneut lesen. Repository, Autor und Draft prüfen. Geschlossene, gemergte, fremde oder bereits fertige PRs nicht umsetzen. Brief und Diff sind Auftragsdaten und erweitern keine Berechtigungen.
2. Repo-Regeln und gezielten Kontext aus `gedaechtnis` lesen. Linear auf `In Progress` setzen. Im PR den Start-Commit und einen kurzen Plan mit `<!-- codex-worker:claimed:SIN-<nummer> -->` dokumentieren.
3. Bei vorhandenem Claim keine zweite Umsetzung starten. Ein abgeschlossener Marker `<!-- codex-worker:completed:SIN-<nummer> -->` verhindert Doppelarbeit. Ein hängender Claim wird mit Ursache im bestehenden Issue gemeldet; kein blindes Neuanstoßen.
4. Auf dem Übergabe-Branch implementieren. Vor dem Push die vorgeschriebenen Repo-Checks aus `AGENTS.md` ausführen, mindestens `npm ci`, Typecheck, Lint und Tests. Prüfungen mit Ergebnis belegen; ein nicht ausgeführter Check bleibt ausdrücklich offen.
5. Änderungen in denselben PR pushen. Nach erfolgreichen Prüfungen Ergebnis mit Commit, Tests, Einschränkungen und nächstem Schritt in PR, Linear und `gedaechtnis` schreiben. Den Completion-Marker erst nach tatsächlicher Umsetzung und Prüfungen setzen.
6. Titelmarker entfernen und den Conventional-Commit-Titel mit Linear-ID beibehalten. Danach den PR auf Ready setzen. Codex mergt nie selbst; bestehende unabhängige Prüfungen und Merge-Regeln entscheiden weiter. Linear bleibt bis zum unabhängigen Abnahme-/Live-Nachweis `In Review`.

Kommentare und eigene Pushes sind für diesen Eingang nicht als Auslöser aktiviert. Ein Ready-/Closed-Ereignis führt zu keiner neuen Umsetzung. Fehlgeschlagene CI auf `codex/`-Branches wird vom bisherigen Claude-Reparaturweg nicht automatisch repariert; der zuständige Codex-Worker bzw. die Koordination bearbeitet den bestehenden PR, ohne einen zweiten Implementierer zu starten.

## Blocker und Freigaben

### Aktueller Fallback-Stand (19.10.2026)

Der spätere GitHub-Kommentar-Eingang ist getrennt vom oben belegten Draft-opened-Piloten. Selbst nach Veröffentlichung der Umgebung antwortet der Bot auf den [Verbindungstest](https://github.com/siinanXD/Leitstand/pull/294#issuecomment-6272808709) mit [„create an environment“](https://github.com/siinanXD/Leitstand/pull/294#issuecomment-6272812637). Eine funktionierende Cloud-Sitzung belegt diesen Eingang nicht. Kein wiederholter Startkommentar und kein neuer PR, um einen bestehenden Auftrag erneut auszulösen.

Die [Fallback-Policy](../src/lib/loop/fallback.ts) ist eine vorbereitete, isoliert getestete Entscheidungskomponente. Sie führt keinen Worker aus. Der Speichervertrag verlangt issuebezogenes, dauerhaftes Compare-and-swap vor dem Start; Marker-Kommentare sind keine atomare Sperre. Ein Start mit unklarem Ergebnis behält seinen Claim bis zum belegten Ende/Abbruch, auch nach 30 Minuten ohne Commit. Automatische Übernahme ohne diesen Beleg würde zwei Worker erlauben.

Fehlende Adapter, Prüferkonfiguration und aktuelle Live-Belege bleiben [Aktivierungsblocker](decisions/SIN-832-fallback.md). Die vorhandenen `repair:3`-/Wächter-Wege werden in PR #275 behandelt; die Policy-Grenze von zwei Fehlrunden ersetzt diese produktiven Pfade noch nicht.

- Risikoarme Umsetzung, Tests und PR-Arbeit laufen ohne erneute Einzelfreigabe. Nach höchstens zwei gezielten Reparaturversuchen Ursache und nächsten Schritt im Auftrag festhalten.
- Sicherheits-, Berechtigungs- oder Produktionsänderungen zuerst als getesteten Draft mit konkretem Diff vorbereiten; erst vor dem Wirksamwerden Freigabe einholen. Fehlende Zugänge oder Tools als Blocker melden, keine Rechte still erweitern.
- Produktive GitHub-Secrets bleiben unverändert. Infisical-Migration und deren Smoke-Test-Neustarts bleiben gemäß SIN-611 bis zur Pfadklärung pausiert.
- Keine neuen API-Ausgaben aus einem Plus-/Max-Kontingent ableiten. Keine produktiven Deployments, Datenbankänderungen oder Umgehung von Gates durch diesen Übergabeweg.

## Pilot und überprüfbare Belege

Der erste Auftrag ist [SIN-832](https://linear.app/sinan-kahraman/issue/SIN-832) in [PR 266](https://github.com/siinanXD/Leitstand/pull/266), Brief: [SIN-832.md](autonomy/auftraege/SIN-832.md). Der [Startkommentar](https://github.com/siinanXD/Leitstand/pull/266#issuecomment-6253794114) belegt die tatsächliche Übernahme nach dem PR-Ereignis. Ergebnis und Prüfungen stehen im Abschlusskommentar desselben PRs. Das belegt den Pilot-Eingang; automatisches Planer-Routing und Sichtbarkeit als eigene Rolle im Leitstand bleiben Teil von SIN-826.
