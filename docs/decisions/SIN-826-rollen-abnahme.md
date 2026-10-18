# SIN-826: Rollen nach tatsächlicher Ausführung bewerten

13 registrierte Rollen bedeuten nicht 13 funktionsfähige Worker. [Rollen-Abnahme](../autonomy/ROLLEN-ABNAHME.md) dokumentiert je Rolle Auslöser, Ausführer, Werkzeuge, Ergebnisbeleg und Grenze der Aussage; keine pauschale Freigabe.

Konkret repariert wird der nachweislich nicht startbare Research-CLI-Einstieg (CommonJS/Top-Level-await). Der Regressionstest startet den echten Prozess: trocken ohne Netz/Datei, negative Quellenantwort ohne Datei und erfolgreiche Antwort beider Quellen mit Datei. Kein Modell, neue Abhängigkeit oder Produktionszugang erforderlich. DRY_RUN wird explizit auf `1` geprüft, Netzwerk wartet höchstens 15 Sekunden. Bot-Advisor-Skill verspricht keine automatische Ausführung allein durch Registerdateien mehr.

Andere Befunde bleiben getrennt: Content-API-Abrechnung SIN-453, Doku-Werkzeuge SIN-537, Security-Prüfer SIN-827. Keine konkurrierende Bearbeitung von SIN-808. Worker-Routing/Anzeige und vollständige Live-Abnahme bleiben offen; dadurch wird SIN-826 nicht als vollständig fertig ausgegeben.
