// GitHub-Adapter für native Codex-Reviews. Liest nur PR-Metadaten; kein Checkout/Modell-API-Aufruf.
import { execFileSync } from "node:child_process";
import { leseCodexAnforderung, type NativeReview } from "../../src/lib/pruefer/codex";

type Kommentar = { id: number; body: string; created_at: string; updated_at: string; user: { login: string; type: string } | null };
export const REPOS = ["siinanXD/Leitstand", "siinanXD/Content-Agent-Lernapp"];

export function github<T>(pfad: string, ...args: string[]): T {
  return JSON.parse(execFileSync("gh", ["api", pfad, ...args], { encoding: "utf8", maxBuffer: 50_000_000 }));
}

export function seiten<T>(pfad: string): T[] {
  return github<T[][]>(pfad, "--paginate", "--slurp").flat();
}

function vertraut(k: Kommentar, owner: string): boolean {
  return k.user?.login.toLowerCase() === owner.toLowerCase() || (k.user?.login === "github-actions[bot]" && k.user.type === "Bot");
}

export function ladeAnforderungen(kommentare: Kommentar[], owner: string) {
  return kommentare.filter(k => vertraut(k, owner)).flatMap(k => {
    const a = leseCodexAnforderung(k.body, k.created_at);
    return a ? [a] : [];
  });
}

export function bindeCodexAntworten(reviews: NativeReview[], kommentare: Kommentar[]): NativeReview[] {
  return [...reviews, ...kommentare.map(k => ({ id: k.id, body: k.body, commit_id: null, submitted_at: k.updated_at, user: k.user }))];
}

export function ladeCodexLage(repo: string, nummer: string, jetzt: Date) {
  if (!REPOS.includes(repo)) throw new Error("Repository nicht freigegeben");
  const owner = repo.split("/")[0];
  const kommentare = seiten<Kommentar>(`repos/${repo}/issues/${nummer}/comments?per_page=100`);
  const anforderungen = ladeAnforderungen(kommentare, owner);
  const reviews = bindeCodexAntworten(seiten<NativeReview>(`repos/${repo}/pulls/${nummer}/reviews?per_page=100`), kommentare);
  const seit = `${jetzt.toISOString().slice(0, 10)}T00:00:00Z`;
  const heute = REPOS.flatMap(r => ladeAnforderungen(seiten<Kommentar>(`repos/${r}/issues/comments?since=${seit}&per_page=100`), owner))
    .filter(a => Date.parse(a.erstellt) >= Date.parse(seit)).length;
  return { anforderungen, reviews, heute };
}

export function pruefeAktuellenPr(repo: string, nummer: string, head: string, basis: string) {
  const pr = github<{ state: string; draft: boolean; title: string; body: string | null; head: { sha: string; repo: { full_name: string } }; base: { sha: string; ref: string; repo: { full_name: string } } }>(`repos/${repo}/pulls/${nummer}`);
  if (pr.state !== "open" || pr.draft || pr.head.sha !== head || pr.base.ref !== "main" || pr.head.repo.full_name !== repo || pr.base.repo.full_name !== repo) throw new Error("PR-Ziel oder Head geändert, kein nativer Anstoß");
  // Produkt-Reviews benutzen die Produktbasis, eigene Reviews den aktuell geschützten main-Stand.
  const branch = github<{ protected: boolean; commit: { sha: string } }>(`repos/${repo}/branches/main`);
  if (!branch.protected || (repo.endsWith("/Leitstand") ? branch.commit.sha !== basis : pr.base.sha !== basis)) throw new Error("Geschützte PR-Basis geändert, kein nativer Anstoß");
  return pr;
}

export async function fordereCodexAn(repo: string, nummer: string, body: string) {
  // gh liest den Body über stdin; keine Shell-Interpolation und keine URL-/Argument-Secrets.
  execFileSync("gh", ["api", `repos/${repo}/issues/${nummer}/comments`, "--method", "POST", "--input", "-"], { input: JSON.stringify({ body }), stdio: ["pipe", "ignore", "pipe"] });
}
