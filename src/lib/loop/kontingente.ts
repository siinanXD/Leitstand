/**
 * SIN-1046: Kontingent-bewusster Dispatcher. Ist ein Kontingent leer (Vercel-Tageslimit), starten nur Issues,
 * die es nicht brauchen. Rein, kein Netz; `scripts/loop/loop.ts` liefert die Commit-Status und schreibt die Ereignisse.
 */

import kontingente from "../../../docs/autonomy/kontingente.json";
import type { LinearIssue } from "./auswahl";
import { schreibPfade } from "./parallel";

export type CommitStatus = { context: string; description: string | null; created_at: string };
type Eintrag = { erkennung: { kontext: string; text: string }; sperre_stunden: number; betrifft_pfade: string[] };

export const KONTINGENTE: Record<string, Eintrag> = kontingente.kontingente;

export type Sperre = { id: string; bis: Date };

const SONDERZEICHEN = /[.+?^$(){}|[\]\\]/g;

/** Pfad-Muster: `*` steht für beliebige Zeichen im Dateinamen, sonst gilt der Pfad selbst oder alles darunter. */
function trifft(muster: string, pfad: string): boolean {
  if (!muster.includes("*")) return pfad === muster || pfad.startsWith(muster + "/");
  const re = new RegExp("^" + muster.split("*").map((s) => s.replace(SONDERZEICHEN, "\\$&")).join("[^/]*") + "$");
  return re.test(pfad.split("/").pop() ?? pfad);
}

/** Gesperrte Kontingente: jüngster Status mit Kontext und Text der Erkennung + Sperrdauer liegt noch in der Zukunft. */
export function aktiveSperren(statuses: CommitStatus[], jetzt: Date): Sperre[] {
  return Object.entries(KONTINGENTE).flatMap(([id, k]) => {
    const text = new RegExp(k.erkennung.text, "i");
    const zeiten = statuses
      .filter((s) => s.context.toLowerCase().includes(k.erkennung.kontext) && text.test(s.description ?? ""))
      .map((s) => Date.parse(s.created_at))
      .filter(Number.isFinite);
    if (!zeiten.length) return [];
    const bis = new Date(Math.max(...zeiten) + k.sperre_stunden * 3_600_000);
    return bis > jetzt ? [{ id, bis }] : [];
  });
}

/** Das Issue braucht das Kontingent, wenn ein Schreibpfad betroffen ist; ohne `worker-pfade` gilt es als „braucht alles“. */
export function braucht(i: Pick<LinearIssue, "description">, id: string): boolean {
  const pfade = schreibPfade(i);
  return !pfade.length || pfade.some((p) => KONTINGENTE[id].betrifft_pfade.some((m) => trifft(m, p)));
}

/** Kandidaten, die ein gesperrtes Kontingent brauchen, mit Grund `kontingent:<id>`; die übrigen starten wie sonst. */
export function ohneGesperrte<T extends Pick<LinearIssue, "identifier" | "description">>(
  kandidaten: T[],
  sperren: Sperre[],
): { frei: T[]; uebersprungen: { issue: T; grund: string }[] } {
  const frei: T[] = [];
  const uebersprungen: { issue: T; grund: string }[] = [];
  for (const issue of kandidaten) {
    const s = sperren.find((x) => braucht(issue, x.id));
    if (s) uebersprungen.push({ issue, grund: `kontingent:${s.id}` });
    else frei.push(issue);
  }
  return { frei, uebersprungen };
}
