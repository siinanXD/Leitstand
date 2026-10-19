/**
 * SIN-870: Codex-Routing. Rein, ohne Netz. Nur Issues mit Label `codex` und `risk:low` gehen an Codex,
 * alle anderen bleiben bei Claude. Die Übergabe folgt docs/CODEX-WORKER.md (Draft-PR mit Titelmarker und Briefdatei).
 */
import type { LinearIssue } from "./auswahl";

const hat = (labels: string[], name: string) => labels.some((l) => l.toLowerCase() === name);

/** `codex` und ausdrücklich `risk:low`; jedes höhere Risiko oder Stopplabel hält das Issue bei Claude. */
export const codexGeeignet = (labels: string[]) =>
  hat(labels, "codex") && hat(labels, "risk:low") &&
  !["risk:medium", "risk:high", "no-automerge", "needs-human", "sinan"].some((l) => hat(labels, l));

export type Uebergabe = { branch: string; datei: string; titel: string; commit: string; brief: string; body: string };

export function codexUebergabe(i: LinearIssue): Uebergabe {
  if (!/^SIN-\d+$/.test(i.identifier)) throw new Error("Codex-Übergabe: ungültige Issue-Kennung");
  const kurz = i.identifier.toLowerCase();
  const datei = `docs/autonomy/auftraege/${i.identifier}.md`;
  const thema = i.title.replace(/\s+/g, " ").trim();
  return {
    branch: `codex/auftrag-${kurz}`,
    datei,
    titel: `chore(worker): ${thema} [codex-worker] (${i.identifier})`,
    commit: `docs(worker): Auftrag ${i.identifier} an Codex übergeben\n\nPart of ${i.identifier}`,
    brief: [`# ${i.identifier}: ${thema}`, "", `Linear: ${i.url}`, "", (i.description ?? "").trim() || "(keine Beschreibung)", ""].join("\n"),
    body: `Linear: ${i.url}\nBrief: \`${datei}\`\n\nÜbergabe an den Codex-Worker nach docs/CODEX-WORKER.md (SIN-870). Genau ein Implementierer: Claude startet für dieses Issue nicht.`,
  };
}
