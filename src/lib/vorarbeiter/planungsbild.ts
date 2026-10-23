// Planungsbild (SIN-943): Frontend- und Design-Issues bekommen das PNG ihres Figma-Frames als Anhang. Rein, Netz kommt herein.
import { DEFAULT_FILE_KEY, knotenBild } from "../figma";
import { bereichVon } from "../loop/bereich";

export const FIGMA_FEHLT = "Figma nicht verfügbar";

/** Desktop-Frames je Seite (AGENTS.md); spezifischere Namen zuerst. shortcut: Stichwörter im Titel, bei Fehlgriffen den Marker `figma-frame: ID` in die Beschreibung setzen. */
const FRAMES: [RegExp, string][] = [
  [/ablauf nach agent/i, "47:28"],
  [/ablauf/i, "21:2"],
  [/abh[äa]ngigkeit/i, "15:1662"],
  [/auswertung/i, "35:54"],
  [/freigabe/i, "35:2"],
  [/deine aufgaben/i, "15:1730"],
  [/alle projekte/i, "20:6"],
  [/details/i, "10:3"],
  [/[üu]bersicht/i, "52:190"],
  [/projekt/i, "15:2"],
];
/** Titel einer Oberfläche bekommen das Label `frontend`. shortcut: Stichwörter wie bei `artLabel`, ausbauen bei Fehlgriffen. */
export const istFrontendTitel = (titel: string): boolean => /\b(seite|ansicht|karte|oberfläche|komponente|layout)\b/i.test(titel);

const MARKER = /figma-frame:\s*(\d+:\d+)/i;

export const frameFuer = (titel: string, beschreibung: string): string | null =>
  MARKER.exec(beschreibung)?.[1] ?? FRAMES.find(([r]) => r.test(titel))?.[1] ?? null;

type Issue = { titel: string; beschreibung: string; labels: string[] };
type Deps = {
  env: Record<string, string | undefined>;
  fetch: Parameters<typeof knotenBild>[3];
  legeAn: (beschreibung: string) => Promise<string>;
  haengeAn: (issueId: string, png: Uint8Array, dateiname: string) => Promise<void>;
};

const brauchtBild = (labels: string[]) => bereichVon(labels) === "frontend" || labels.some((l) => l.toLowerCase() === "design");

/** Legt das Issue an (Beschreibung mit Frame-ID oder dem Hinweis „Figma nicht verfügbar“) und hängt das PNG an. Bricht nie ab. */
export async function legeMitPlanungsbild(i: Issue, d: Deps): Promise<string> {
  if (!brauchtBild(i.labels)) return d.legeAn(i.beschreibung);
  const frame = frameFuer(i.titel, i.beschreibung);
  let png: Uint8Array | null = null;
  if (frame) png = await knotenBild(DEFAULT_FILE_KEY, frame, d.env, d.fetch).catch(() => null);
  const zusatz = png ? `Figma-Frame: \`${frame}\`` : frame ? `${FIGMA_FEHLT} (Frame \`${frame}\`)` : FIGMA_FEHLT;
  const id = await d.legeAn(`${i.beschreibung}\n\n${zusatz}`.trim());
  if (png) await d.haengeAn(id, png, `figma-${frame!.replace(":", "-")}.png`).catch((e: Error) => console.warn(`Planungsbild nicht angehängt: ${e.message}`));
  return id;
}
