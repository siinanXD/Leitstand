// Wartende Freigaben (SIN-517): offene PRs aus `loop_snapshot.open_prs` mit `risk:high` oder `needs-human`, grüner CI und ohne Entwurf.

import { grundFuerFreigabe, istRepo, REPOS, type RepoName } from "./freigabe";

export type OffenerPr = { repo: string | null; nummer: number; titel: string; url: string | null; labels: string[]; entwurf: boolean; ciGruen: boolean; grund: string | null };
export type WartenderPr = { key: string; repo: RepoName; nummer: number; titel: string; url: string | null; grund: string };

const GRUEN = new Set(["success", "green", "passed", "pass", "ok", "gruen", "grün"]);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** `open_prs` als Liste (oder JSON-Text) von PR-Objekten; Unlesbares fällt weg. */
export function parseOffenePrs(raw: unknown): OffenerPr[] {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const o = obj(x);
    const nummer = o && (o.number ?? o.pr ?? o.nummer);
    if (!o || typeof nummer !== "number" || !Number.isInteger(nummer) || nummer <= 0) return [];
    const labels = (Array.isArray(o.labels) ? o.labels : []).flatMap((l) => {
      const name = typeof l === "string" ? l : str(obj(l)?.name);
      return name ? [name.trim().toLowerCase()] : [];
    });
    const ci = str(o.ci ?? o.ci_status ?? o.checks)?.toLowerCase();
    return [
      {
        repo: str(o.repo),
        nummer,
        titel: str(o.title ?? o.titel) ?? `PR #${nummer}`,
        url: str(o.url ?? o.html_url),
        labels,
        entwurf: o.draft === true || o.entwurf === true,
        ciGruen: !!ci && GRUEN.has(ci),
        grund: str(o.reason ?? o.gate_reason ?? o.grund),
      },
    ];
  });
}

const REPO_VON_PROJEKT = Object.fromEntries(Object.entries(REPOS).map(([repo, { projekt }]) => [projekt, repo]));

/** Filter: `risk:high` oder `needs-human`, CI grün, kein Entwurf, bereits `freigegeben` zählt nicht. Je Repo und Nummer einmal, alle Projekte. */
export function wartendePrs(snapshot: { project: string; open_prs: OffenerPr[] }[]): WartenderPr[] {
  const treffer = new Map<string, WartenderPr>();
  for (const s of snapshot) {
    for (const pr of s.open_prs) {
      const repo = pr.repo ?? REPO_VON_PROJEKT[s.project];
      if (!istRepo(repo)) continue;
      if (!pr.labels.includes("needs-human") && (pr.entwurf || !pr.ciGruen || pr.labels.includes("freigegeben"))) continue;
      if (!["risk:high", "needs-human", "no-automerge", "migration"].some((l) => pr.labels.includes(l))) continue;
      const key = `${repo}#${pr.nummer}`;
      treffer.set(key, { key, repo, nummer: pr.nummer, titel: pr.titel, url: pr.url, grund: pr.grund ?? grundFuerFreigabe(pr.labels, []) ?? "Wartet auf deine Freigabe." });
    }
  }
  return [...treffer.values()];
}

/** Tab-Titel mit Zähler, z. B. „(4) Leitstand“. */
export const tabTitel = (n: number): string => (n > 0 ? `(${n}) Leitstand` : "Leitstand");
