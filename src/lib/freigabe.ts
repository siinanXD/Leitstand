// Freigabe eines offenen PR (SIN-424). Läuft nur serverseitig; Netz kommt als `Netz` herein, damit die Logik testbar bleibt.

/** Repos, für die der Leitstand freigeben darf. `merge`: Der Leitstand mergt selbst (Workflow-PRs mergen sonst nie automatisch). */
export const REPOS = {
  "siinanXD/Content-Agent-Lernapp": { projekt: "lernapp", aktion: "label" },
  "siinanXD/Leitstand": { projekt: "leitstand", aktion: "merge" },
} as const;

export type RepoName = keyof typeof REPOS;
export const istRepo = (v: unknown): v is RepoName => typeof v === "string" && Object.hasOwn(REPOS, v);
export const istPrNummer = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

export type PrDatei = { filename: string };
export type PrKopf = { number: number; title: string; body: string | null; state: string; draft: boolean; merged: boolean; html_url: string; user: string | null; head: string; base: string; sha: string; labels: string[] };

/** Die vier Aufrufe, die Freigabe braucht. Jeder wirft bei Fehlern. */
export type Netz = {
  pr(repo: RepoName, nr: number): Promise<PrKopf>;
  dateien(repo: RepoName, nr: number): Promise<string[]>;
  label(repo: RepoName, nr: number, name: string): Promise<void>;
  squash(repo: RepoName, nr: number, sha: string): Promise<void>;
};

export type Ergebnis = { ok: true; aktion: "label" | "merge" } | { ok: false; grund: "nicht-offen" | "entwurf" | "github" };

/** Setzt `freigegeben` (Lern-App) oder mergt per Squash (Leitstand). Prüft vorher, dass der PR offen und kein Entwurf ist. */
export async function freigeben(netz: Netz, repo: RepoName, nr: number): Promise<Ergebnis> {
  try {
    const pr = await netz.pr(repo, nr);
    if (pr.state !== "open" || pr.merged) return { ok: false, grund: "nicht-offen" };
    if (pr.draft) return { ok: false, grund: "entwurf" };
    const aktion = REPOS[repo].aktion;
    if (aktion === "label") await netz.label(repo, nr, "freigegeben");
    else await netz.squash(repo, nr, pr.sha);
    return { ok: true, aktion };
  } catch {
    return { ok: false, grund: "github" };
  }
}

/** Grund, warum der PR auf dich wartet; nur aus echten Merkmalen, sonst null. */
export function grundFuerFreigabe(labels: string[], dateien: string[]): string | null {
  if (dateien.some((d) => d.startsWith(".github/workflows/"))) return "Ändert Workflows. Solche PRs mergen nie automatisch.";
  if (labels.includes("needs-human")) return "Der Loop hat den PR mit needs-human an dich übergeben.";
  if (labels.includes("risk:high")) return "Als hohes Risiko markiert (risk:high).";
  return null;
}

/** Zeile für `loop_events`; Schlüssel wie in `scripts/loop/loop.ts`. */
export function protokollZeile(repo: RepoName, nr: number, ergebnis: Ergebnis) {
  return { project: REPOS[repo].projekt, step: "freigabe", status: ergebnis.ok ? "ok" : "fehler", issue: null, pr: nr };
}

const GITHUB = "https://api.github.com";

/** GitHub-Aufrufe mit eigenem Token (`LEITSTAND_GITHUB_TOKEN`), nie im Browser. */
export function githubNetz(token: string, hole: typeof fetch = fetch): Netz {
  const rufe = async <T>(pfad: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
    const res = await hole(`${GITHUB}${pfad}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${pfad}: ${res.status}`);
    return (res.status === 204 ? null : await res.json()) as T;
  };
  return {
    async pr(repo, nr) {
      const p = await rufe<{ number: number; title: string; body: string | null; state: string; draft?: boolean; merged?: boolean; html_url: string; user: { login: string } | null; head: { ref: string; sha: string }; base: { ref: string }; labels?: { name: string }[] }>(`/repos/${repo}/pulls/${nr}`);
      return { number: p.number, title: p.title, body: p.body, state: p.state, draft: p.draft === true, merged: p.merged === true, html_url: p.html_url, user: p.user?.login ?? null, head: p.head.ref, base: p.base.ref, sha: p.head.sha, labels: (p.labels ?? []).map((l) => l.name) };
    },
    async dateien(repo, nr) {
      const namen: string[] = [];
      for (let seite = 1; seite <= 10; seite++) {
        const teil = await rufe<PrDatei[]>(`/repos/${repo}/pulls/${nr}/files?per_page=100&page=${seite}`);
        namen.push(...teil.map((d) => d.filename));
        if (teil.length < 100) break;
      }
      return namen;
    },
    async label(repo, nr, name) {
      await rufe(`/repos/${repo}/issues/${nr}/labels`, { method: "POST", body: { labels: [name] } });
    },
    async squash(repo, nr, sha) {
      await rufe(`/repos/${repo}/pulls/${nr}/merge`, { method: "PUT", body: { merge_method: "squash", sha } });
    },
  };
}
