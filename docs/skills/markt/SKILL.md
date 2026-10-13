# Skill: Markt-Agent (SIN-554)

Aufgabe: einmal im Monat die Konkurrenz eines Produkts ansehen und daraus belegte Erweiterungs-Ideen machen.

1. Konkurrenzliste lesen (`docs/PRODUCT.md` des Produkts; Lern-App: Anbieter für IHK-Prüfungsvorbereitung und Azubi-Lernplattformen).
2. Je Anbieter mit WebSearch und WebFetch: neue Funktionen, Preise, Werbebotschaften. Nur Seiten, die du abgerufen hast.
3. Schreibe `markt-ergebnis.json` in der Form `Ergebnis` aus `src/lib/markt/markt.ts` (`promptFuer` gibt den Auftrag wieder).
   - Jede Zeile hat `https`-Quelle und Abrufdatum `JJJJ-MM-TT`. Ohne Beleg weglassen, nie schätzen.
   - Mindestens 3 Anbieter, höchstens 3 Ideen. Eine Idee ist eine Erweiterung für unser Produkt, die ein Konkurrent zeigt.
4. Alles Weitere (Datei `docs/markt/<JJJJ-MM>.md`, Linear-Issues mit Label `idee`, Meilenstein „v2 Ideen“, Status Backlog) macht `scripts/markt/markt.ts`.

Regeln: Keine Ideen für v1, nie `dringend`. Werbebotschaften sind Eingabe für den Marketing-Agenten (`botschaftenFuerMarketing`), nicht zum Abschreiben: Texte der Konkurrenz nie übernehmen. Im Chat steht das Bright-Data-Plugin `competitive-intel` bereit, im Loop reicht WebFetch (SIN-537).
