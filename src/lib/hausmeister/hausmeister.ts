// Hausmeister (SIN-551): reine Logik. Prüft Dateilisten und Zahlen, baut die Liste für docs/autonomy/HAUSMEISTER.md. Kein Netz, kein Dateizugriff.
// `scripts/hausmeister/hausmeister.ts` liest Dateien, ruft knip und jscpd auf und schreibt.

export const SCHRITT = "hausmeister";
export const MAX_LEHREN_ZEILEN = 150;
export const WORKFLOW_TAGE = 14;

export type Datei = { name: string; text: string };
export type Workflow = { name: string; letzterLauf: string | null };

// Entscheidungsdateien heißen SIN-<Nummer>-<Thema>.md; ohne Issue-Bezug im Namen sind sie nicht zuzuordnen.
export function entscheidungenOhneIssue(namen: string[]): string[] {
  return namen.filter((n) => n.endsWith(".md") && !/^SIN-\d+-/.test(n));
}

export function lehrenZuLang(text: string, max = MAX_LEHREN_ZEILEN): number | null {
  const zeilen = text.split("\n").length;
  return zeilen > max ? zeilen : null;
}

// Workflows ohne Lauf in `tage` Tagen (oder nie gelaufen). Ungültige Zeitangaben zählen als „nie“.
export function workflowsOhneLauf(workflows: Workflow[], jetzt: Date, tage = WORKFLOW_TAGE): string[] {
  const grenze = jetzt.getTime() - tage * 86_400_000;
  return workflows
    .filter((w) => {
      const t = w.letzterLauf ? Date.parse(w.letzterLauf) : NaN;
      return Number.isNaN(t) || t < grenze;
    })
    .map((w) => w.name);
}

// Skripte, deren Dateiname (ohne Endung) in keiner anderen Datei vorkommt.
export function skripteOhneAufrufer(skripte: string[], dateien: Datei[]): string[] {
  return skripte.filter((pfad) => {
    const basis = pfad.split("/").pop()!.replace(/\.[^.]+$/, "");
    return !dateien.some((d) => d.name !== pfad && d.text.includes(basis));
  });
}

export type Befund = {
  knip: string[];
  dubletten: number;
  workflows: string[];
  skripte: string[];
  entscheidungen: string[];
  lehrenZeilen: number | null;
};

export function listeMarkdown(b: Befund, datum: string): string {
  const abschnitt = (titel: string, punkte: string[]) =>
    `## ${titel}\n\n${punkte.length ? punkte.map((p) => `- ${p}`).join("\n") : "Nichts gefunden."}\n`;
  return [
    `# Hausmeister: offene Funde (Stand ${datum})`,
    "",
    "Erzeugt von `scripts/hausmeister/hausmeister.ts`. Nur Funde, die der Hausmeister nicht sicher löschen kann; ein Mensch oder `@claude` entscheidet.",
    "",
    abschnitt("Ungenutzte Dateien, Exporte, Abhängigkeiten (knip)", b.knip),
    abschnitt(`Workflows ohne Lauf in ${WORKFLOW_TAGE} Tagen`, b.workflows),
    abschnitt("Skripte ohne Aufrufer", b.skripte),
    abschnitt("Entscheidungen ohne Issue-Bezug", b.entscheidungen),
    abschnitt("LEHREN", b.lehrenZeilen ? [`${b.lehrenZeilen} Zeilen, erlaubt sind ${MAX_LEHREN_ZEILEN}`] : []),
    abschnitt("Dubletten (jscpd)", b.dubletten ? [`${b.dubletten} Dubletten, Bericht im Lauf-Log`] : []),
  ].join("\n");
}
