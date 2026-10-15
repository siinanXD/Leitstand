// Gesprächs-Eingang fürs Gedächtnis (SIN-612): Linear-Issues mit Label `gedaechtnis` werden Notizen unter `Gespräche/` im Vault.
// Rein, kein Netz. `scripts/gedaechtnis/schreiben.ts` holt die Issues, pusht und schließt sie danach.
import { VAULT_URL, kopf, tagBerlin, type Dateien } from "./gedaechtnis";

export const EINGANG_LABEL = "gedaechtnis";
const MAX_TEXT = 8000;

export type EingangIssue = { id: string; identifier: string; title: string; description: string | null; url: string; createdAt: string; stateType: string };

/** Pfad hängt nur an der Kennung: ändert sich das Issue, wird dieselbe Notiz überschrieben (kein Doppel). */
export const notizPfad = (identifier: string): string => `Gespräche/${identifier.replace(/[^A-Za-z0-9-]/g, "-")}.md`;
export const notizUrl = (identifier: string): string => `${VAULT_URL}/blob/main/${encodeURI(notizPfad(identifier))}`;

const art = (text: string): "entscheidung" | "idee" => (/^[#*\s]*entscheidung/im.test(text) ? "entscheidung" : "idee");
const einzeilig = (t: string): string => t.replace(/\s+/g, " ").replace(/[[\]|#^]/g, "").trim() || "ohne Titel";

/** Verweise auf andere Eingangs-Notizen, wenn deren Kennung im Text steht. */
function verweise(text: string, eigene: string, alle: Set<string>): string[] {
  const ids = new Set(text.match(/\bSIN-\d+\b/g) ?? []);
  ids.delete(eigene);
  return [...ids].filter((i) => alle.has(i)).sort().map((i) => `- [[${notizPfad(i).replace(/\.md$/, "")}]]`);
}

function notiz(i: EingangIssue, alle: Set<string>): string {
  const text = (i.description ?? "").trim().slice(0, MAX_TEXT);
  const datum = tagBerlin(new Date(i.createdAt));
  const a = art(text);
  const siehe = verweise(`${i.title}\n${text}`, i.identifier, alle);
  return [
    ...kopf(a, "alle", datum, a === "idee" ? "neu" : "gilt", einzeilig(i.title), i.url),
    `# ${i.identifier}: ${einzeilig(i.title)} #${a} #eingang`,
    "",
    text || "Kein Text.",
    "",
    `Linear: ${i.url}`,
    ...(siehe.length ? ["", "## Siehe auch", ...siehe] : []),
    "",
    `[[Tage/${datum}]] · [[00 Wo stehen wir]]`,
  ].join("\n") + "\n";
}

/** Eine Notiz je Issue; abgebrochene Issues (canceled) fallen weg. */
export function eingangDateien(issues: EingangIssue[]): Dateien {
  const offen = issues.filter((i) => i.stateType !== "canceled");
  const alle = new Set(offen.map((i) => i.identifier));
  return Object.fromEntries(offen.map((i) => [notizPfad(i.identifier), notiz(i, alle)]));
}

/** Nur Issues, die noch nicht erledigt sind, werden kommentiert und geschlossen. */
export const zuSchliessen = (issues: EingangIssue[]): EingangIssue[] => issues.filter((i) => i.stateType !== "completed" && i.stateType !== "canceled");

export const schlussKommentar = (identifier: string): string => `Ins Gedächtnis übernommen: ${notizUrl(identifier)}`;
