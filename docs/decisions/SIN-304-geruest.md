# SIN-304 — Grundgerüst des Leitstands

- **Links:** Linear [SIN-304](https://linear.app/sinan-kahraman/issue/SIN-304), [SIN-242](https://linear.app/sinan-kahraman/issue/SIN-242), [SIN-303](https://linear.app/sinan-kahraman/issue/SIN-303); Figma-Datei `7Ti9iVUjUjw3rh9WYhSu9K` (Frame „00 Stilblatt“); Lern-App `docs/design/regeln-2026.md`; [Next.js](https://nextjs.org/docs) (Version 16.3.8 wie die Lern-App); [next/font](https://nextjs.org/docs/app/getting-started/fonts)
- **Entscheidung:**
  1. Eigenes Repo `siinanXD/leitstand` (privat), Next.js 16.3.8, React 19.3.0, TypeScript, reines CSS mit Tokens (kein Tailwind: weniger Abhängigkeiten).
  2. Farben stehen als `--color-*` in `src/app/globals.css`, gelesen aus Figma-Variablen (`get_variable_defs`, 08.10.2026): `bg/base #0c0a09`, `bg/surface #1c1917`, `bg/raised #292524`, `border/subtle #3a3532`, `text/primary #fafaf9`, `text/secondary #a8a29e`, `accent/primary #ea580c`, `accent/strong #c2410c`, `accent/soft #431407`, Status `ok #22c55e`, `warn #f59e0b`, `error #ef4444`, `info #38bdf8`. Rundung und Linien nach Regeln 2026 (Leitstand: 2 px, 1 px).
  3. Schrift Geist und Geist Mono über `next/font/google`, wie die Lern-App. Das Paket `geist` bleibt draußen: Lizenz SIL OFL, nicht MIT/Apache (AGENTS.md: neue Pakete nur mit MIT/Apache).
  4. Die Startseite zeigt „Noch keine Daten“ statt Zahlen. Die Datenquelle kommt mit SIN-303.
- **Annahmen:**
  - Supabase: gleiches Projekt wie die Lern-App (`loop_events`, `loop_snapshot`), bis SIN-304 etwas anderes verlangt.
  - Der Build holt die Schrift von Google Fonts; in der Cloud-Sitzung ist das gesperrt. Lokal geprüft mit entfernter Schrift, in der CI läuft der echte Build.
  - Workflows des Loops (Dispatcher, Worker, Gate) folgen im Projekt-Starter; Secrets setzt Sinan über Infisical.
- **Warum:** Kleinster Start, der Figma-Werte statt Schätzungen nutzt und CI mit Barrierefreiheits-Test von Anfang an hat.
