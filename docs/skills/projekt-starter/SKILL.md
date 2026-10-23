# Skill: Projekt-Starter (SIN-202, SIN-1049)

Es gilt `docs/STANDARD.md` (SIN-641).

Aufgabe: ein neues Produkt einrichten (Repo, Infisical, Vercel, Sentry, Langfuse, Supabase) und im Leitstand anmelden.

## Pflichtschritt: Register-Eintrag

Jedes neue Produkt bekommt in `docs/autonomy/produkte.json` einen Eintrag, bevor das erste Issue gebaut wird:

- `id` wie in `src/lib/projekte.ts`, `repo`, `infisicalOrdner` (`/<id>`).
- Langfuse-, Sentry-, Vercel- und Supabase-Projekt als Kennung; unbekannt heißt `null`, nie geraten.
- `secrets`: nur die Namen. Die Werte stehen in Infisical im Ordner des Produkts, nie im Repo. Ein Produkt teilt keinen Langfuse-Schlüssel mit einem anderen.

Der Kontingent-Sammler (`scripts/kontingent/sammler.ts`) schreibt danach `loop_snapshot.quotas` für das Produkt, `/kosten` zeigt es im Produktfilter. Fehlende Projekte oder Schlüssel (`langfuseLuecken` in `src/lib/kontingent/produkte.ts`) stehen gebündelt in der `sinan`-Aufgabe des Starters, nicht als einzelne Issues.

Ohne Register-Eintrag ist der Start nicht fertig. Die Abnahme-Probe des Produkts liest `quotas` aus `loop_snapshot`.
