import type { LinearIssue } from "./auswahl";
import { gemeinsam } from "../vorarbeiter/vorarbeiter";

/** SIN-856: nur Leitstand auf zwei erhöhen; alte Produktlimits bleiben unverändert. */
export function maxParallel(repo: string, produkt?: string, leitstand?: string): number {
  const eigenes = repo.toLowerCase() === "siinanxd/leitstand";
  const n = Number(eigenes ? leitstand || "2" : produkt || "1");
  return Number.isSafeInteger(n) && n > 0 ? eigenes ? Math.min(2, n) : n : 1;
}

/** Expliziter Schreib-Scope statt aus beiläufigen Links vermuteter Dateien; unbekannt bleibt exklusiv. */
function schreibPfade(i: Pick<LinearIssue, "description">): string[] {
  const m = i.description?.match(/<!-- worker-pfade: (\[[^\n]*\]) -->/);
  try {
    const p: unknown = m ? JSON.parse(m[1]) : null;
    if (!Array.isArray(p) || !p.length || !p.every(x => typeof x === "string" && /^[\w.\-/[\]]+$/.test(x) && !x.startsWith("/") && !x.split("/").some(s => s === "." || s === ".." || !s))) return [];
    const pfade = p as string[];
    // Steuerung wird auch bei verschiedenen Dateien nacheinander geändert.
    return pfade.some(x => /^(\.github|scripts\/(loop|waechter|vorarbeiter)|src\/lib\/(loop|waechter))(\/|$)/.test(x)) ? [...pfade, "@steuerung"] : pfade;
  } catch {
    return [];
  }
}

/** Kandidaten sind bereits nach Priorität/Kontingent sortiert. Auch wartende offene PRs schützen ihre Dateien. */
export function parallelAuswahl(kandidaten: LinearIssue[], laufend: LinearIssue[], max: number, offenePrs: Pick<LinearIssue, "description">[] = laufend): LinearIssue[] {
  const wahl: LinearIssue[] = [];
  for (const i of kandidaten) {
    if (wahl.length >= Math.max(0, max - laufend.length)) break;
    const meine = schreibPfade(i);
    if ([...laufend, ...offenePrs, ...wahl].some(a => {
      const andere = schreibPfade(a);
      return !meine.length || !andere.length || gemeinsam(meine, andere);
    })) continue;
    wahl.push(i);
  }
  return wahl;
}
