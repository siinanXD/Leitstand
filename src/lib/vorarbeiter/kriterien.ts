// Kriterien-Check beim Anlegen (SIN-929, Stufe 0): feste Regeln, kein Modell. Jeder Fertig-Haken ist im Diff belegbar,
// trägt `[nach Aktivierung]` oder nennt einen Testnamen. Ohne prüfbaren Haken startet das Issue nicht (Label `kriterien-unklar`).
import { leseHaken } from "../loop/haken";

export const MARKER = "[nach Aktivierung]";
export const LABEL_UNKLAR = "kriterien-unklar";
const TESTNAMEN = /\n*<!-- testnamen: .*? -->\n?/;

/** Linear liefert Markdown maskiert (`\[nach Aktivierung\]`); ein oder mehrere Marker am Anfang zählen als einer. */
const MARKER_AM_ANFANG = /^(?:\\?\[nach Aktivierung\\?\]\s*)+/i;
const hatMarker = (text: string) => MARKER_AM_ANFANG.test(text.trim());
/** Ohne Linear-Maskierung (`\[`, `\]`, `\_`), damit derselbe Text nicht bei jedem Dispatch als „geändert“ gilt. */
const ohneMaskierung = (text: string) => text.replace(/\\([[\]_])/g, "$1");

export type Art = "test" | "diff" | "live";
const LIVE = /lauf-link|nach dem merge|woche|zählung|zaehlung|screenshot|supabase-zeile|\blive\b|\brun\b|\bläufe?\b/i;
const DIFF = /probe|datei|doku|regel|skill|workflow|schema|migration/i;

/** `test`: beginnt mit „Test:“. `live`: braucht den aktivierten Stand. `diff`: im PR-Diff belegbar. Sonst null (unklar). */
export function ordneEin(text: string): Art | null {
  const t = text.trim();
  if (hatMarker(t)) return "live";
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
  const ergaenzt = haken.filter((h, i) => arten[i] === "live" && !hatMarker(h.text)).map((h) => h.text);
  const fehlt = new Set(ergaenzt);
  let text = beschreibung
    .split("\n")
    .map((z) => {
      const m = /^(\s*[-*]\s+\[[ xX]\]\s+)(.+?)\s*$/.exec(z);
      if (!m) return z;
      // Doppelte Marker (Fehler vor dem 22.10.: jeder Dispatch setzte einen weiteren davor) auf einen zurückführen.
      if (hatMarker(m[2])) return `${m[1]}${MARKER} ${m[2].trim().replace(MARKER_AM_ANFANG, "")}`;
      return fehlt.has(m[2]) ? `${m[1]}${MARKER} ${m[2]}` : z;
    })
    .join("\n")
    .replace(TESTNAMEN, "");
  if (testnamen.length) text = `${text.trimEnd()}\n\n<!-- testnamen: ${JSON.stringify(testnamen)} -->\n`;
  return { beschreibung: text, testnamen, unklar: !arten.some((a) => a === "test" || a === "diff"), ergaenzt };
}

export const UNKLAR_KOMMENTAR = `Kriterien-Check (SIN-929): kein Fertig-Haken ist prüfbar (weder \`Test: …\` noch im Diff belegbar). Label \`${LABEL_UNKLAR}\` gesetzt, das Issue startet nicht. Haken präzisieren, dann das Label entfernen.`;

export type KriterienIssue = { identifier: string; description: string | null; stateType: string; labels: string[] };
export type KriterienAenderung = { identifier: string; beschreibung: string | null; label: boolean };

/**
 * Welche Todo-Issues (Label `claude`) der Dispatcher vor der Auswahl anfassen muss (SIN-929):
 * `beschreibung` = neuer Text (Marker/Testnamen ergänzt) oder null, `label` = `kriterien-unklar` setzen (und einmal kommentieren).
 * Issues, die das Label schon tragen oder bei denen nichts zu ändern ist, tauchen nicht auf; das Label ist der Wiederholungsschutz.
 */
export function kriterienPlan(issues: KriterienIssue[]): KriterienAenderung[] {
  return issues.flatMap((i) => {
    const labels = i.labels.map((l) => l.toLowerCase());
    if (i.stateType !== "unstarted" || !labels.includes("claude") || labels.includes(LABEL_UNKLAR)) return [];
    const p = pruefeKriterien(i.description ?? "");
    const beschreibung = ohneMaskierung(p.beschreibung).trimEnd() !== ohneMaskierung(i.description ?? "").trimEnd() ? p.beschreibung : null;
    if (!p.unklar && beschreibung === null) return [];
    return [{ identifier: i.identifier, beschreibung, label: p.unklar }];
  });
}
