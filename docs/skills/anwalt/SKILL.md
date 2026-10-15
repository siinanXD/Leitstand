# Skill: Anwalt (SIN-552)

Es gilt `docs/STANDARD.md` (SIN-641).

Gilt für jeden PR, der Migrationen, `src/lib/storage/`, Tracking, Prompts mit Nutzerdaten, `/datenschutz`, `/impressum`, `/ki-hinweis` oder `werbemittel` ändert (`betrifftRecht` in `src/lib/anwalt/anwalt.ts`).

**Keine Rechtsberatung.** Der Agent markiert und begründet, Sinan oder ein Anwalt entscheidet. Dieser Satz steht in jeder Ausgabe.

## Quellen (nur daraus zitieren)

DSGVO auf EUR-Lex · BDSG und TDDDG auf gesetze-im-internet.de · EU-KI-Verordnung Art. 50 · DDG § 5. Prüflisten-Vorlage: `gdpr-dsgvo-expert` aus davila7/claude-code-templates (MIT; Quelle im Issue SIN-552, hier nicht abgerufen).

## Prüfliste

1. Rechtsgrundlage je Datenfeld (Art. 6, Art. 13): Kommentar `Rechtsgrundlage: …` in der Migration.
2. Einwilligung (Art. 7): widerrufbar, nachweisbar, vor dem Setzen.
3. Auskunft und Löschung (Art. 15–17): neues Feld ist exportier- und löschbar.
4. AVV (Art. 28): Dienst steht in `docs/recht/AVV.md` mit Link.
5. Drittlandtransfer (Art. 44 ff.): Region, Standardvertragsklauseln.
6. Cookies und Tracking (TDDDG § 25): ohne Einwilligung nur technisch Notwendiges.
7. KI-Kennzeichnung (KI-VO Art. 50): jeder KI-Text und -Clip ist gekennzeichnet.
8. Impressum (DDG § 5): Pflichtangaben vollständig.
9. Nutzungsrechte von Vorlagen und Bildern: Lizenz im PR genannt, keine Fremdmarken.
10. Keine Personendaten in Prompts (AGENTS.md).

## Ampel

- Rot: Tracking ohne Einwilligung, Personendaten im Prompt. Label `needs-human`, nie Auto-Merge.
- Gelb: Personenfeld ohne Rechtsgrundlage, fehlende KI-Kennzeichnung, Impressum ohne DDG-Bezug.
- Grün: keine Funde. Die Regeln sind Stichproben auf hinzugefügten Zeilen, kein Ersatz für die Liste oben.
