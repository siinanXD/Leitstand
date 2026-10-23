# Skill: Designer (SIN-561)

Es gilt `docs/STANDARD.md` (SIN-641).

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

## Abnahme nach dem Bauen (SIN-580)

Quelle der Regeln: [vercel-labs/agent-skills → `web-design-guidelines`](https://github.com/vercel-labs/agent-skills) (MIT), über 100 Regeln zu Barrierefreiheit, Fokus, Formulare, Animation, Schrift, Bilder, Leistung, Navigation/Zustand, Dark Mode, Touch, Sprache. Vor jedem Frontend-PR dort die Regeln der berührten Bereiche durchgehen (`npx skills add vercel-labs/agent-skills`, nur `web-design-guidelines`). Der Bauer liest diesen Abschnitt bei jedem Frontend-PR, der Prüfer hakt ihn im PR unter `## Abnahme` ab: jede Zeile grün oder mit Begründung.

Eigene Regeln (SIN-578):

1. Keine Zahl ohne Wort, keine Kennung (SIN-…, #…) außerhalb von „Details“.
2. Vier Zustände: laden, leer, Fehler, Daten.
3. Start hat drei Karten, genau eine offen (`details name="start"`), eingeklappt höchstens 844 px hoch.
4. Jeder Reiter führt auf seine Adresse, h1 passt, aktiver Reiter hat `aria-current="page"`.
5. Tastatur: Tab-Reihenfolge sinnvoll, Fokus sichtbar (≥ 2 px, Kontrast ≥ 3:1), Enter und Leertaste öffnen Karten.
6. Ziele ≥ 44×44 px, kein waagerechtes Scrollen bei 390 px, 195 px (200 % Zoom) und 20 px Grundschrift.
7. Mit `prefers-reduced-motion` steht jede Animation.

Maschinell geprüft in `e2e/abnahme.spec.ts` (Teil von `build`, beide Breiten 390×844 und 1280×800) und mit `npm run lighthouse` (Handy-Profil: Barrierefreiheit ≥ 95, Leistung ≥ 90, Best Practices ≥ 95; Grenzen nie senken, um zu mergen).
