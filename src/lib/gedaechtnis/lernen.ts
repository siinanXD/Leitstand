// Fehler und Lehren fürs Gedächtnis (SIN-615): rote loop_events je Tag zu `Fehler/`, wiederholte Gründe und LEHREN.md zu `Lehren/`.
// Rein, kein Netz. `scripts/gedaechtnis/schreiben.ts` liest die Zeilen und schreibt das Ergebnis in den Vault.
import { dateiname, kopf, kurz, tagBerlin, type Dateien } from "./gedaechtnis";

const QUELLE_FEHLER = "loop_events";
/** Derselbe Grund so oft → Eintrag in `Lehren/`. */
export const WIEDERHOLUNG = 3;

export type FehlerZeile = { created_at: string; project: string | null; issue: string | null; status: string | null; grund: string | null };

const rot = (zeilen: FehlerZeile[]): (FehlerZeile & { grund: string })[] => zeilen.filter((z): z is FehlerZeile & { grund: string } => z.status === "fehler" && !!z.grund?.trim());

/** `Fehler/<Tag>.md` je Berliner Kalendertag mit roten Läufen, gebündelt nach Grund; `ab` ist der erste Tag, der vollständig im Lesefenster liegt. */
export function fehlerNotizen(zeilen: FehlerZeile[], ab: string): Dateien {
  const tage = new Map<string, (FehlerZeile & { grund: string })[]>();
  for (const z of rot(zeilen)) {
    const tag = tagBerlin(new Date(z.created_at));
    if (tag >= ab) tage.set(tag, [...(tage.get(tag) ?? []), z]);
  }
  return Object.fromEntries(
    [...tage].map(([tag, liste]) => {
      const gruende = new Map<string, FehlerZeile[]>();
      for (const z of liste) gruende.set(kurz(z.grund, 160), [...(gruende.get(kurz(z.grund, 160)) ?? []), z]);
      const projekte = [...new Set(liste.map((z) => z.project ?? "?"))];
      const text = [...gruende]
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
        .map(([grund, l]) => {
          const issues = [...new Set(l.flatMap((z) => (z.issue ? [z.issue] : [])))];
          return `- ${l.length}× ${grund}${issues.length ? ` (${issues.join(", ")})` : ""}`;
        });
      const kopfZeilen = kopf("fehler", projekte.length === 1 ? projekte[0] : "alle", tag, "protokolliert", `${liste.length} rote Läufe am ${tag}, nach Grund gebündelt`, QUELLE_FEHLER);
      return [`Fehler/${tag}.md`, [...kopfZeilen, `# Fehler ${tag}`, "", ...text, ""].join("\n")];
    }),
  );
}

/** Gleicher Grund mindestens `WIEDERHOLUNG`-mal → eine Lehre, verlinkt auf die Tage, an denen er auftrat. */
export function lehrenAusFehlern(zeilen: FehlerZeile[], jetzt: Date): Dateien {
  const tage = new Map<string, Map<string, number>>();
  for (const z of rot(zeilen)) {
    const grund = kurz(z.grund, 160);
    const tag = tagBerlin(new Date(z.created_at));
    const je = tage.get(grund) ?? new Map<string, number>();
    tage.set(grund, je.set(tag, (je.get(tag) ?? 0) + 1));
  }
  return Object.fromEntries(
    [...tage].flatMap(([grund, je]) => {
      const n = [...je.values()].reduce((s, x) => s + x, 0);
      if (n < WIEDERHOLUNG) return [];
      const kopfZeilen = kopf("lehre", "alle", tagBerlin(jetzt), "gilt", `Grund trat ${n}× auf: ${kurz(grund, 70)}`, QUELLE_FEHLER);
      const text = [...kopfZeilen, `# ${kurz(grund, 80)}`, "", `${n}× in roten Läufen. Ursache klären, bevor derselbe Lauf wieder startet.`, "", ...[...je.keys()].sort().map((t) => `- [[Fehler/${t}]]`), ""].join("\n");
      return [[`Lehren/Wiederholt - ${dateiname(kurz(grund, 60))}.md`, text] as [string, string]];
    }),
  );
}

/** Zeilen aus LEHREN.md („Muster → Maßnahme (SIN-123)“) als Lehre-Notizen; Überschriften und Zeilen ohne Pfeil bleiben draußen. */
export function lehrenAusDatei(text: string, repo: string, jetzt: Date): Dateien {
  const produkt = repo.toLowerCase().includes("lern") ? "lernapp" : "leitstand";
  const out: Dateien = {};
  for (const roh of text.split("\n")) {
    const zeile = roh.replace(/^\s*[-*]\s+/, "").trim();
    if (!zeile.includes("→")) continue;
    const id = /\((SIN-\d+)\)/.exec(zeile)?.[1] ?? "ohne Kennung";
    const titel = kurz(zeile.split("→")[0], 60);
    out[`Lehren/${dateiname(`${produkt} ${id} ${titel}`)}.md`] = [...kopf("lehre", produkt, tagBerlin(jetzt), "gilt", zeile, `${repo}/LEHREN.md`), `# ${titel}`, "", kurz(zeile, 600), ""].join("\n");
  }
  return out;
}
