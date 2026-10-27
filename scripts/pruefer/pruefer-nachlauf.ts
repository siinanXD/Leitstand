// Liest neue native Antworten und fordert die vorhandene Hauptprüfung aus main an. Kein Modellaufruf.
import { execFileSync } from "node:child_process";
import { brauchtCodexNachlauf } from "../../src/lib/pruefer/codex-nachlauf";
import type { NativeReview } from "../../src/lib/pruefer/codex";
import { bindeCodexAntworten, github, ladeAnforderungen, REPOS, seiten } from "./codex";

type Kommentar = { id: number; body: string; created_at: string; updated_at: string; user: { login: string; type: string } | null };
type Pr = { number: number; title: string; draft: boolean; labels: { name: string }[]; head: { sha: string; ref: string; repo: { full_name: string } | null } };
const DRY = process.env.DRY_RUN === "1";

function pruefeQuelle() {
  const main = github<{ protected: boolean; commit: { sha: string } }>("repos/siinanXD/Leitstand/branches/main");
  if (!main.protected || (process.env.GITHUB_SHA && main.commit.sha !== process.env.GITHUB_SHA)) throw new Error("Nachlauf muss aus aktuellem geschütztem main stammen");
}

function pruefeAntwort(repo: string, pr: Pr): boolean {
  if (pr.draft || pr.labels.some(l => l.name === "needs-human") || !(/^(claude|codex)\//.test(pr.head.ref) || /\bSIN-\d+\b/i.test(pr.title)) || pr.head.repo?.full_name !== repo) return false;
  const kommentare = seiten<Kommentar>(`repos/${repo}/issues/${pr.number}/comments?per_page=100`);
  const fragen = ladeAnforderungen(kommentare, "siinanXD");
  if (!fragen.some(f => f.head === pr.head.sha)) return false;
  const offiziell = kommentare.filter(k => ["siinanXD", "github-actions[bot]"].includes(k.user?.login ?? "") && k.body.startsWith("<!-- pruefer-zweites-modell -->\n"));
  const letzter = offiziell.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];
  const gelesen = /<!-- codex-antworten:v1 ([a-f0-9]{64}) -->/.exec(letzter?.body ?? "")?.[1] ?? "";
  const reviews = seiten<NativeReview>(`repos/${repo}/pulls/${pr.number}/reviews?per_page=100`);
  return brauchtCodexNachlauf(pr.head.sha, fragen, gelesen, bindeCodexAntworten(reviews, kommentare));
}

if (!DRY) pruefeQuelle();
for (const repo of REPOS) {
  for (const pr of seiten<Pr>(`repos/${repo}/pulls?state=open&per_page=100`)) {
    if (!pruefeAntwort(repo, pr)) continue;
    if (DRY) console.log(`[trocken] würde vorhandene Prüfung für ${repo}#${pr.number} erneut lesen`);
    else execFileSync("gh", ["workflow", "run", "pruefer.yml", "--repo", "siinanXD/Leitstand", "--ref", "main", "-f", `pr=${pr.number}`, "-f", `repo=${repo}`, "-f", "pruefen=true"], { stdio: "inherit" });
  }
}
