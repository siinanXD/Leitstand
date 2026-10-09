// Einteilung geänderter Dateien in Bereiche (SIN-424). Rein; gleiche Bereiche wie der PR-Steckbrief der Lern-App (SIN-422).
// Die Pfadregeln sind nach der Issue-Beschreibung gebaut und mit `scripts/autonomy/steckbrief.mjs` der Lern-App abzugleichen.

export const BEREICHE = ["Datenbank", "Infrastruktur", "Deployment", "Backend", "Frontend", "Inhalte", "Doku und Tests"] as const;
export type Bereich = (typeof BEREICHE)[number];

export type BereichZeile = { bereich: Bereich; dateien: number; satz: string };

export const STANDARDSATZ: Record<Bereich, string> = {
  Datenbank: "Ändert Datenbankschema oder Migrationen.",
  Infrastruktur: "Ändert Konfiguration, Abhängigkeiten, Skripte oder Workflows.",
  Deployment: "Ändert den Ablauf von Auslieferung oder Container.",
  Backend: "Ändert serverseitige Logik, Schnittstellen oder gemeinsamen Code.",
  Frontend: "Ändert Seiten, Komponenten oder Gestaltung.",
  Inhalte: "Ändert Texte, Daten oder Bilder.",
  "Doku und Tests": "Ändert Dokumentation oder Tests.",
};

// Erste passende Regel gewinnt: Tests und Doku vor allem anderen, damit Tests unter src/ nicht zu Backend zählen.
const REGELN: [Bereich, RegExp][] = [
  ["Doku und Tests", /(^|\/)(docs?|e2e|tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$|\.(md|mdx|txt)$|(^|\/)(LICENSE|CODEOWNERS)$/i],
  ["Datenbank", /(^|\/)(supabase\/(migrations|seed)|migrations|prisma|drizzle)\/|\.sql$|(^|\/)supabase\/config\.toml$/i],
  ["Deployment", /(^|\/)(vercel\.json|Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|\.dockerignore)$|^\.github\/workflows\/[^/]*(deploy|release|migrate)[^/]*$/i],
  ["Infrastruktur", /^\.github\/|^scripts\/|(^|\/)(package(-lock)?\.json|tsconfig[^/]*\.json|[^/]*\.config\.[cm]?[jt]s|eslint\.config\.mjs|\.gitignore|\.env\.example|\.nvmrc)$/i],
  ["Backend", /(^|\/)(api|server|actions)\/|(^|\/)route\.[jt]s$|^src\/lib\/|^supabase\/functions\//i],
  ["Frontend", /\.(tsx|jsx|css|scss|html)$|^src\/(app|components)\//i],
  ["Inhalte", /^(content|data|locales|messages|public)\/|\.(png|jpe?g|gif|svg|webp|ico|json|ya?ml)$/i],
];

export function bereichVon(datei: string): Bereich | null {
  const pfad = datei.replace(/^\.?\//, "");
  return REGELN.find(([, muster]) => muster.test(pfad))?.[0] ?? null;
}

/** Sätze aus dem Abschnitt `## Bereiche` des PR-Textes: je Zeile `- Bereich: Satz`. */
export function satzAusPrText(text: string | null | undefined): Partial<Record<Bereich, string>> {
  const sätze: Partial<Record<Bereich, string>> = {};
  let drin = false;
  for (const zeile of (text ?? "").split(/\r?\n/)) {
    if (/^##\s/.test(zeile)) {
      drin = /^##\s+Bereiche\s*$/i.test(zeile);
      continue;
    }
    if (!drin) continue;
    const z = /^\s*[-*]\s*([^:]+?)\s*:\s*(.+?)\s*$/.exec(zeile);
    const bereich = z && BEREICHE.find((b) => b.toLowerCase() === z[1].toLowerCase());
    if (z && bereich) sätze[bereich] = z[2];
  }
  return sätze;
}

/** Bereiche mit Zahl der Dateien und Satz, in fester Reihenfolge; leere Bereiche entfallen. Unzuordenbare Dateien zählen zu Infrastruktur. */
export function bereicheAusDateien(dateien: string[], prText?: string | null): BereichZeile[] {
  const zaehler = new Map<Bereich, number>();
  for (const d of new Set(dateien)) {
    const b = bereichVon(d) ?? "Infrastruktur";
    zaehler.set(b, (zaehler.get(b) ?? 0) + 1);
  }
  const eigene = satzAusPrText(prText);
  return BEREICHE.filter((b) => zaehler.has(b)).map((bereich) => ({ bereich, dateien: zaehler.get(bereich) ?? 0, satz: eigene[bereich] ?? STANDARDSATZ[bereich] }));
}
