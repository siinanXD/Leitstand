import type { LinearIssue } from "./auswahl";
import { bereichVon } from "./bereich";
import { gemeinsam } from "../vorarbeiter/vorarbeiter";

/** Offene PRs schützen die tatsächlichen Diff-Pfade, unabhängig von Linear-Zuordnung oder Beschreibung. */
export async function ladePrSchutz(prs: { number: number }[], lade: (pr: number, page: number) => Promise<{ filename: string; previous_filename?: string }[]>): Promise<Pick<LinearIssue, "description">[]> {
  return Promise.all(prs.map(async pr => {
    try {
      const pfade: string[] = [];
      for (let page = 1; ; page++) {
        const files = await lade(pr.number, page);
        for (const f of files) pfade.push(f.filename, ...(f.previous_filename ? [f.previous_filename] : []));
        if (files.length < 100) break;
        // GitHub liefert höchstens 3000 Dateien; unvollständige Diffs bleiben exklusiv.
        if (page === 30) throw new Error("PR-Dateiliste möglicherweise gekürzt");
      }
      return { description: pfade.length ? `<!-- worker-pfade: ${JSON.stringify([...new Set(pfade)])} -->` : null };
    } catch {
      return { description: null };
    }
  }));
}

/** SIN-896: Ein PR, der auf Sinans Freigabe (`risk:high` ohne `freigegeben`) wartet, schützt seine Dateien höchstens so lange. */
export const WARTE_SCHUTZ_STUNDEN = 24;

export function schuetztNoch(pr: { labels: string[]; createdAt: string }, jetzt: Date): boolean {
  const wartet = pr.labels.includes("risk:high") && !pr.labels.includes("freigegeben");
  return !wartet || jetzt.getTime() - Date.parse(pr.createdAt) < WARTE_SCHUTZ_STUNDEN * 3_600_000;
}

/** SIN-856: nur Leitstand auf zwei erhöhen; alte Produktlimits bleiben unverändert. */
export function maxParallel(repo: string, produkt?: string, leitstand?: string): number {
  const eigenes = repo.toLowerCase() === "siinanxd/leitstand";
  const n = Number(eigenes ? leitstand || "2" : produkt || "1");
  return Number.isSafeInteger(n) && n > 0 ? eigenes ? Math.min(2, n) : n : 1;
}

/** SIN-919: Steuerung im Sinne von AGENTS.md (Gate, Dispatcher, Loop). Ein pauschales `.github`/`.github/workflows` bleibt Steuerung. */
const STEUERUNG = /^(\.github(\/workflows)?$|\.github\/workflows\/(automerge|dispatch|pruefer|claude|repair)\.ya?ml$|scripts\/(loop|waechter|vorarbeiter)(\/|$)|src\/lib\/(loop|waechter)(\/|$))/;
export const istSteuerung = (p: string) => STEUERUNG.test(p);

/**
 * SIN-919: Sammelpfade. Jedes Issue legt dort eine eigene Datei an (Entscheidung, Probe) oder hängt nur an (LEHREN, Changelog).
 * Das ist kein Schreibkonflikt; einen Merge-Konflikt beim Anhängen löst der Worker. Sonst lief im Leitstand fast nie etwas parallel.
 */
export const SAMMELPFADE = ["docs/decisions", "docs/abnahme", "docs/abnahme.yml", "docs/autonomy/LEHREN.md", "CHANGELOG.md"];
const istSammel = (p: string) => SAMMELPFADE.some((s) => p === s || p.startsWith(`${s}/`));

/** Überschneidung zweier Schreib-Scopes ohne Sammelpfade. Leerer Scope (nicht angegeben) bleibt exklusiv. */
export function konflikt(meine: string[], andere: string[]): boolean {
  if (!meine.length || !andere.length) return true;
  return gemeinsam(meine.filter((p) => !istSammel(p)), andere.filter((p) => !istSammel(p)));
}

/** SIN-919: Pfad-Vorschlag aus der Beschreibung (Pfade in Backticks), für Issues ohne `worker-pfade`. Leer = unklar. */
export function vorschlagPfade(text: string | null | undefined): string[] {
  const treffer = [...String(text ?? "").matchAll(/`([^`\s]+)`/g)].map((m) => m[1].replace(/[:,.]+$/, ""));
  const pfade = treffer.filter((p) => /^(src|scripts|docs|e2e|supabase|public|\.github)\//.test(p) && !p.includes("..") && /^[\w.\-/[\]()]+$/.test(p));
  return [...new Set(pfade)].sort();
}

/** SIN-919: Trockenlauf des Abgleichs – je Issue ohne `worker-pfade` eine Zeile mit Vorschlag oder „unklar“. */
export function abgleichZeilen(issues: { identifier: string; description: string | null }[]): { identifier: string; vorschlag: string[]; zeile: string }[] {
  return issues.filter((i) => !schreibPfade(i).length).map((i) => {
    const vorschlag = vorschlagPfade(i.description);
    return { identifier: i.identifier, vorschlag, zeile: `${i.identifier}: ${vorschlag.length ? JSON.stringify(vorschlag) : "unklar, bleibt allein"}` };
  });
}

/** Expliziter Schreib-Scope statt aus beiläufigen Links vermuteter Dateien; unbekannt bleibt exklusiv. */
export function schreibPfade(i: Pick<LinearIssue, "description">): string[] {
  // Linear maskiert Markdown in der API-Antwort (\[, \], \_); der Block muss trotzdem lesbar bleiben (SIN-896).
  const m = i.description?.replace(/\\([[\]_])/g, "$1").match(/<!-- worker-pfade: (\[[^\n]*\]) -->/);
  try {
    const p: unknown = m ? JSON.parse(m[1]) : null;
    if (!Array.isArray(p) || !p.length || !p.every(x => typeof x === "string" && /^[\w.\-/[\]()]+$/.test(x) && !x.startsWith("/") && !x.split("/").some(s => s === "." || s === ".." || !s))) return [];
    const pfade = p as string[];
    // Steuerung (Gate, Dispatcher, Loop) wird auch bei verschiedenen Dateien nacheinander geändert (SIN-919: andere Workflows nicht).
    return pfade.some(istSteuerung) ? [...pfade, "@steuerung"] : pfade;
  } catch {
    return [];
  }
}

/** Kandidaten sind bereits nach Priorität/Kontingent sortiert. Auch wartende offene PRs schützen ihre Dateien. */
export function parallelAuswahl(kandidaten: LinearIssue[], laufend: LinearIssue[], max: number, offenePrs: Pick<LinearIssue, "description">[] = []): LinearIssue[] {
  const wahl: LinearIssue[] = [];
  for (const i of kandidaten) {
    if (wahl.length >= Math.max(0, max - laufend.length)) break;
    // SIN-896: je Bereich höchstens ein Worker.
    const b = bereichVon(i.labels);
    if (b && [...laufend, ...wahl].some(a => bereichVon(a.labels) === b)) continue;
    const meine = schreibPfade(i);
    if ([...laufend, ...offenePrs, ...wahl].some(a => konflikt(meine, schreibPfade(a)))) continue;
    wahl.push(i);
  }
  return wahl;
}
