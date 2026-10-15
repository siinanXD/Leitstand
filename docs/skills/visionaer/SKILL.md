# Skill: Visionär (SIN-573)

Es gilt `docs/STANDARD.md` (SIN-641).

Aufgabe: ein Produkt in Versionen teilen, damit Änderungen gut getrennt bleiben. Läuft nur, wenn der CEO `fertig` meldet, sonst nie. Auslöser und Werkzeuge stehen in `docs/autonomy/agents.json`.

1. Lies `docs/PRODUCT.md`, `docs/markt/*.md` (Feature-Agent), offene `idee`-Issues, Kosten und PostHog-Kennzahlen. Mehr nicht. Nichts erfinden: fehlt eine Zahl, schreibe es.
2. Entscheide `vorschlag`: `naechste_version`, `pause` (es gibt gerade nichts, was eine Version trägt) oder `abschliessen` (das Produkt ist fertig).
3. Bei `naechste_version` genau eine Version: Name `v2 <Name>`, Ziel in einem Satz, 3 bis 7 Fertig-Punkte, Nicht-Ziele, geschätzte Tage, Voraussetzung (z. B. „erst nach 10 echten Nutzern“), passende `idee`-Issues. Nie mehr als eine offene Version je Produkt.
4. Ausgabe nur als JSON nach `docs/schemas/visionaer.json`, Datei `docs/autonomy/laeufe/<ISSUE-ID>.json`. Prüfen: `npx tsx scripts/autonomy/schema.ts visionaer <datei>`. Kein Freitext.

Alles Weitere (`docs/VERSIONEN.md`, Linear-Meilenstein, `idee`-Issues verschieben, Stand `vorschlag`) macht `scripts/visionaer/visionaer.ts`. Jede neue Version braucht Sinans „go“ auf der Startseite, außer `nur_fehler` ist wahr.
