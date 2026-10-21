// Kriterien-Check beim Anlegen (SIN-929, Stufe 0): feste Regeln, kein Modell. Jeder Fertig-Haken ist im Diff belegbar,
// trägt `[nach Aktivierung]` oder nennt einen Testnamen. Ohne prüfbaren Haken startet das Issue nicht (Label `kriterien-unklar`).
import { leseHaken } from "../loop/haken";

export const MARKER = "[nach Aktivierung]";
export const LABEL_UNKLAR = "kriterien-unklar";
const TESTNAMEN = /\n*<!-- testnamen: .*? -->\n?/;

export type Art = "test" | "diff" | "live";
const LIVE = /lauf-link|nach dem merge|woche|zählung|zaehlung|screenshot|supabase-zeile|\blive\b|\brun\b|\bläufe?\b/i;
const DIFF = /probe|datei|doku|regel|skill|workflow|schema|migration/i;

/** `test`: beginnt mit „Test:“. `live`: braucht den aktivierten Stand. `diff`: im PR-Diff belegbar. Sonst null (unklar). */
export function ordneEin(text: string): Art | null {
  const t = text.trim();
  if (t.toLowerCase().startsWith(MARKER.toLowerCase())) return "live";
  if (/^test:/i.test(t)) return "test";
  if (LIVE.test(t)) return "live";
  return DIFF.test(t) ? "diff" : null;
}

export type Pruefung = { beschreibung: string; testnamen: string[]; unklar: boolean; ergaenzt: string[] };

/** Ergänzt fehlende Marker an Live-Haken, schreibt die Testnamen als Block und meldet, ob kein Haken prüfbar ist. */
export function pruefeKriterien(beschreibung: string): Pruefung {
  const haken = leseHaken(beschreibung);
  const arten = haken.map((h) => ordneEin(h.text));
  const testnamen = haken.filter((_, i) => arten[i] === "test").map((h) => h.text.trim());
  const ergaenzt = haken.filter((h, i) => arten[i] === "live" && !h.text.trim().toLowerCase().startsWith(MARKER.toLowerCase())).map((h) => h.text);
  const fehlt = new Set(ergaenzt);
  let text = beschreibung
    .split("\n")
    .map((z) => {
      const m = /^(\s*[-*]\s+\[[ xX]\]\s+)(.+?)\s*$/.exec(z);
      return m && fehlt.has(m[2]) ? `${m[1]}${MARKER} ${m[2]}` : z;
    })
    .join("\n")
    .replace(TESTNAMEN, "");
  if (testnamen.length) text = `${text.trimEnd()}\n\n<!-- testnamen: ${JSON.stringify(testnamen)} -->\n`;
  return { beschreibung: text, testnamen, unklar: !arten.some((a) => a === "test" || a === "diff"), ergaenzt };
}
