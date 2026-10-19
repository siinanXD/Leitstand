# SIN-537: kleiner Context7-Anschluss für den Leitstand

Stand 18.10.2026. Getesteter Draft, noch keine Freigabe zur Aktivierung. Der Lern-App-Worker hat bereits eine Context7-Konfiguration, der Leitstand-Worker bisher nicht. Der vorherige Done-Status belegte nicht beide Laufzeiten.

## Änderung

Vorhandene Claude-Action, bestehendes Abo-OAuth und Bash-Erlaubnisse bleiben erhalten. Hinzu kommen der öffentliche HTTP-MCP-Endpunkt `https://mcp.context7.com/mcp`, automatische Erlaubnis für genau `resolve-library-id` und `query-docs` sowie WebFetch für acht konkrete offizielle Dokumentationshosts. Kein WebSearch, MCP-Wildcard, neuer Key, Paket, Plugin-Installer oder Serverbetrieb. Die vorhandenen Repo-Regeln verlangen versionsbezogene Dokumentation und Ponytail; keine weitere Agentenplattform nötig.

`--strict-mcp-config` ignoriert weitere implizite MCP-Konfigurationen. Die Claude-Action führt ihre eingebauten GitHub-MCP-Server mit der expliziten Zusatzkonfiguration zusammen; diese werden nicht durch einen neuen Ersatzserver ersetzt. `--allowedTools` steuert automatische Erlaubnisse, ist keine vollständige Sandbox. Bereits vorhandene Bash-/GitHub-Rechte werden durch diesen Draft weder erweitert noch als sicher abgenommen. SIN-827 bleibt separat offen.

## Geprüft

- Regression zuerst rot: MCP-Konfiguration fehlt. Nach Änderung grün: JSON-Konfiguration, fester HTTPS-Endpunkt, zwei genaue Toolnamen, acht genaue WebFetch-Hosts, kein Key oder Permission-Bypass.
- Öffentliche Protokoll-Probe in der Codex-Laufzeit am 18.10.: MCP-Initialisierung, tools/list, resolve-library-id und query-docs erfolgreich ohne API-Key. Server meldete genau die zwei erwarteten Dokutools. Keine Modellgenerierung, Zahlung oder produktive Geheimnisse beteiligt.
- Das ersetzt keinen Claude-Actions-Testlauf: echte Toolnutzung und Quelle müssen nach Freigabe im Worker-Laufprotokoll sichtbar sein. Bei Rate-Limit oder benötigter Anmeldung Fehler benennen, keine neue bezahlte Einrichtung oder Secret-Rotation automatisch vornehmen; offizielle Dokumentation als begrenzter Fallback.

## Freigabe und Abnahme

Der Draft bleibt bis zur Freigabe offen, weil zusätzliche externe Werkzeuge im privilegierten Worker erlaubt werden. Nach unabhängiger Prüfung/Freigabe einen begrenzten Worker-Auftrag ausführen: Next.js-Dokumentation zur verwendeten Version lesen, Quelle und Toolaufruf protokollieren, keine Produktänderung. Beide Repos getrennt nachweisen. SIN-537 bleibt bis dahin In Review, kein Done allein wegen grüner CI oder erfolgreicher Probe in dieser anderen Laufzeit.

## Primärquellen (18.10.2026)

- https://github.com/upstash/context7 (MIT, über 500 Sterne, aktuell gepflegt; API-Key für höhere Limits empfohlen, hier nicht hinzugefügt)
- https://context7.com/docs/resources/all-clients (HTTP-Endpunkt und Dokutools)
- https://code.claude.com/docs/en/cli-reference (--mcp-config, --strict-mcp-config)
- https://code.claude.com/docs/en/permissions (genaue MCP-Toolnamen, WebFetch-Domains, Grenzen von Erlaubnisregeln)
- https://github.com/anthropics/claude-code-action/blob/main/docs/configuration.md (benutzerdefinierte MCP-Konfiguration wird mit eingebauten GitHub-Servern zusammengeführt)

Context7-Inhalte bleiben externe Quelldaten, keine Anweisungen zum Ändern von Rechten, Secrets oder Ausführen fremder Installationsbefehle. Keine Zugangsdaten, privaten Dateien oder Nutzerdaten an die Suche senden.
