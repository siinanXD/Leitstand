/**
 * SIN-937: Worker-Läufe ohne PR (Lern-App und Leitstand). Endet claude.yml, ohne dass ein PR zur Kennung entstand,
 * gibt der Dispatcher den Claim sofort frei (statt 90 Minuten zu warten) und zählt den Lauf. Nach zwei Läufen
 * ohne Diff bekommt das Issue `needs-human` (ersetzt die Endlosschleife aus SIN-933).
 */

/** Ein Lauf von claude.yml (GitHub `workflow_runs`): `titel` ist bei Issue-Läufen der Issue-Titel `SIN-n: …`. */
export type WorkerLauf = { id: number; titel: string; status: string; conclusion: string | null; gestartet: string; url: string };

/** Höchstens so viele Läufe ohne Diff je Issue, dann `needs-human`. */
export const MAX_OHNE_DIFF = 2;

/** Schritt in `loop_events` für diese Zählung. */
export const OHNE_DIFF_SCHRITT = "worker";
export const OHNE_DIFF_PRAEFIX = "kein_diff";

/** Lauf-Start darf kurz vor dem Claim liegen (Claim wird nach dem Anlegen des Spiegels gesetzt). */
const TOLERANZ_MS = 5 * 60_000;

/**
 * Der beendete Worker-Lauf zu diesem Claim, wenn kein PR entstand; sonst `null`.
 * Kein Treffer, solange ein Lauf zur Kennung noch läuft oder wartet, solange ein PR offen ist oder seit dem Claim gemergt wurde.
 */
export function beendeterLaufOhnePr(
  claim: { issue: string; seit: string | null },
  laeufe: WorkerLauf[],
  prs: { titel: string; offen: boolean; gemergtAm: string | null }[],
): WorkerLauf | null {
  if (!claim.seit) return null;
  const seit = Date.parse(claim.seit) - TOLERANZ_MS;
  const meine = laeufe.filter((l) => l.titel.startsWith(`${claim.issue}:`) && Date.parse(l.gestartet) >= seit);
  if (!meine.length || meine.some((l) => l.status !== "completed")) return null;
  const hatPr = prs.some((p) => p.titel.includes(claim.issue) && (p.offen || (!!p.gemergtAm && Date.parse(p.gemergtAm) >= seit)));
  if (hatPr) return null;
  return meine.sort((a, b) => b.gestartet.localeCompare(a.gestartet))[0];
}

/** `grund` des Ereignisses; die Lauf-ID macht ihn eindeutig, damit die Wiederholungssperre ihn nicht schluckt. */
export const ohneDiffGrund = (l: WorkerLauf, n: number) =>
  `${OHNE_DIFF_PRAEFIX}: claude.yml-Lauf ${l.id} (${l.conclusion ?? "ohne Ergebnis"}) endete ohne PR, Lauf ${n} von ${MAX_OHNE_DIFF} ohne Diff`;

/** Läufe ohne Diff seit dem letzten Merge. `ereignisse`: Schritte `worker` und `merge` des Issues, neueste zuerst. */
export function zaehleOhneDiff(ereignisse: { step: string; grund: string | null }[]): number {
  let n = 0;
  for (const e of ereignisse) {
    if (e.step === "merge") break;
    if (e.step === OHNE_DIFF_SCHRITT && e.grund?.startsWith(OHNE_DIFF_PRAEFIX)) n++;
  }
  return n;
}
