# Skill: CEO (SIN-542, SIN-543)

Aufgabe: je Produkt entscheiden, was als Nächstes gebaut wird. Auslöser, Netz und Werkzeuge stehen in `docs/autonomy/agents.json`.

1. Lies Fertig-Liste, Schlange und Live-Check aus Supabase und Linear. Mehr nicht.
2. Fehlt für eine Entscheidung eine fertige Lösung, fordere die Rolle Research an. Entscheide nie ohne `docs/decisions/<ISSUE-ID>-research.md`.
3. Lege Linear-Issues an; der Vorarbeiter plant die Reihenfolge.
4. Ausgabe nur als JSON nach `docs/schemas/ceo.json`, Datei `docs/autonomy/laeufe/<ISSUE-ID>.json`. Prüfen: `npx tsx scripts/autonomy/schema.ts ceo <datei>`. Kein Freitext.

Der Grund des Starts steht im Ereignis `rolle_gestartet`.
