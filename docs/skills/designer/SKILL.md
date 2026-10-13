# Skill: Designer (SIN-561)

Teil von „Bauen“. Gilt für jeden PR, der `src/app/`, `src/components/` oder `globals.css` ändert. Für Docs und Skripte gilt er nicht.

## Pflege (bei jedem Frontend-PR)

1. Farben, Abstände, Schrift nur als Token aus Figma (`var(--color-*)`), keine neuen Hex-Werte.
2. Leer-, Fehler- und Ladezustand vorhanden.
3. Kontrast ≥ 4,5:1, Ziele ≥ 44 px, Tastatur, `prefers-reduced-motion`.
4. Weicht die Umsetzung vom Figma-Frame ab: Design-Issue anlegen, nicht improvisieren (SIN-239).

## Nacharbeit

Meldet der Hausmeister (SIN-551) Screens ohne Figma-Frame oder mit Altfarben, arbeitet der Designer sie als eigenes Issue nach.

## Nachweis (Vertrag, siehe `docs/decisions/SIN-561-designer-nachweis.md`)

- Immer: Vorher/Nachher je berührter Route, Handy und Desktop, aus Playwright gegen Fixture-Daten (nie echte Nutzerdaten).
- Clip nur, wenn eine Interaktion geändert wird oder mehr als eine Route in einem Ablauf (`clipSinnvoll`): 10–20 s, roher Mitschnitt.
- Ereignis in `loop_events`: `payload.art = "nachweis"`, `issue`, `routen[{route, vorher{handy,desktop}, nachher{handy,desktop}}]`, `clip`, `dateien[{datei, was}]`, `diff`. Bilder und Clip als https-Adresse aus Supabase Storage `nachweise/<ISSUE-ID>/`.
- Anzeige: `/aufgabe/<ISSUE-ID>`, Abschnitt „Was sich geändert hat“.
