import { istWorkerBranch } from "./auswahl";

/** Höchstens so viele Anstöße je PR, danach `needs-human` (wie die Lern-App). */
export const MAX_KONFLIKT = 2;

const MARKER = /<!-- konflikt:([0-9a-f]+) versuch:(\d+) -->/g;

export type KonfliktPr = { branch: string; headSha: string; mergeableState: string | null; labels: string[]; kommentare: string[] };
export type KonfliktSchritt = { keine: string } | { stopp: true } | { anstoss: { versuch: number; text: string } };

/** Marker eines Anstoßes: Head-Commit und Versuch, damit derselbe Stand nie zweimal angestoßen wird. */
export const konfliktMarker = (sha: string, versuch: number) => `<!-- konflikt:${sha} versuch:${versuch} -->`;

/** Entscheidet für einen offenen PR: einmal je Head-Commit anstoßen, nach MAX_KONFLIKT Versuchen stoppen. */
export function konfliktSchritt(pr: KonfliktPr): KonfliktSchritt {
  if (!istWorkerBranch(pr.branch)) return { keine: "kein Worker-Branch" };
  if (pr.mergeableState !== "dirty") return { keine: "kein Merge-Konflikt" };
  if (pr.labels.includes("needs-human")) return { keine: "wartet schon auf Sinan" };
  const bisher = pr.kommentare.flatMap((k) => [...k.matchAll(MARKER)].map((m) => m[1]));
  if (bisher.includes(pr.headSha)) return { keine: "Head-Commit schon angestoßen" };
  if (bisher.length >= MAX_KONFLIKT) return { stopp: true };
  const versuch = bisher.length + 1;
  const wer = pr.branch.startsWith("codex/") ? "codex" : "claude";
  return {
    anstoss: {
      versuch,
      text: `@${wer} Dieser PR hat einen Merge-Konflikt mit main (Versuch ${versuch} von ${MAX_KONFLIKT}). origin/main in diesen Branch mergen, Konflikte lösen (bei docs/abnahme.yml beide Seiten behalten), npm run typecheck, npm run lint und npm test lokal grün, dann pushen.\n\n${konfliktMarker(pr.headSha, versuch)}`,
    },
  };
}
