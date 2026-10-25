/**
 * Score je Agent-Lauf (SIN-1059). Aufruf: npx tsx scripts/score/score.ts   (loop-merge.yml, nach jedem Merge)
 *
 * Bewertet für Leitstand, Lern-App und Stromlauf AI (docs/autonomy/produkte.json) die PRs der letzten SCORE_TAGE Tage (Standard 3)
 * und die beendeten Läufe der Rollen ohne PR (Planer, Content-Fabrik, Designer). Je Lauf eine Zeile in loop_events (Schritt score,
 * Score als JSON in `grund`, siehe docs/schemas/score.json). Schon bewertete Läufe werden übersprungen, ein erneuter Aufruf ist harmlos.
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GH_TOKEN, LINEAR_API_KEY (worker-pfade, optional), KOSTEN_USD_EUR (optional),
 * SCORE_TAGE, SCORE_CHECK (Standard build), SCORE_OWNER (Standard siinanXD). DRY_RUN=1: nur Ausgabe, nichts geschrieben.
 * Ohne Supabase-Variablen bleibt es bei einer Warnung.
 */
import { readFileSync } from "node:fs";
import { bereitsBewertet, scoreAusLauf, scoreAusPr, scoreGrund, type Ereignis, type Score } from "../../src/lib/score/score";
import { schreibPfade } from "../../src/lib/loop/parallel";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const TAGE = Number(env.SCORE_TAGE) || 3;
const OWNER = env.SCORE_OWNER ?? "siinanXD";
const CHECK = env.SCORE_CHECK ?? "build";
const jetzt = new Date();
const seit = new Date(jetzt.getTime() - TAGE * 86_400_000);
// Ereignisse reichen weiter zurück als die PRs: ein PR kann Tage vor dem Merge gestartet sein.
const ereignisSeit = new Date(jetzt.getTime() - (TAGE + 14) * 86_400_000);
const kurs = Number((env.KOSTEN_USD_EUR ?? "").replace(",", ".")) || null;
const produkte = (JSON.parse(readFileSync("docs/autonomy/produkte.json", "utf8")) as { produkte: { id: string; repo: string }[] }).produkte.filter((p) => ["leitstand", "lernapp", "stromlauf-ai"].includes(p.id));

type Zeile = Ereignis & { issue: string | null; pr: number | null; cost: number | null };

async function gh<T>(pfad: string): Promise<T> {
  const res = await fetch(`https://api.github.com${pfad}`, { headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(env.GH_TOKEN ? { Authorization: `Bearer ${env.GH_TOKEN}` } : {}) }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`GitHub ${pfad}: ${res.status}`);
  return (await res.json()) as T;
}

const sbKopf = () => ({ apikey: env.SUPABASE_SERVICE_ROLE_KEY as string, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` });
async function sbLesen<T>(abfrage: string): Promise<T[]> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events?${abfrage}`, { headers: sbKopf(), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`loop_events lesen: HTTP ${res.status}`);
  return (await res.json()) as T[];
}

/** `worker-pfade` aus der Linear-Beschreibung; ohne Schlüssel oder Treffer null (dann bleibt dateien_ausserhalb_scope null). */
async function workerPfade(issue: string | null): Promise<string[] | null> {
  if (!issue || !env.LINEAR_API_KEY) return null;
  try {
    const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { Authorization: env.LINEAR_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ query: "query($id:String!){issue(id:$id){description}}", variables: { id: issue } }), signal: AbortSignal.timeout(30_000) });
    const d = (await res.json()) as { data?: { issue?: { description: string | null } } };
    const pfade = schreibPfade({ description: d.data?.issue?.description ?? null }).filter((p) => p !== "@steuerung");
    return pfade.length ? pfade : null;
  } catch {
    return null;
  }
}

type GhPr = { number: number; title: string; merged_at: string | null; created_at: string; head: { ref: string } };

async function prScore(repo: string, produkt: string, pr: GhPr, zeilen: Zeile[]): Promise<Score> {
  const n = pr.number;
  const issue = pr.title.match(/SIN-\d+/)?.[0] ?? null;
  const [dateien, commits, kommentare, pruefungen, ereignisse] = await Promise.all([
    gh<{ filename: string }[]>(`/repos/${repo}/pulls/${n}/files?per_page=100`),
    gh<{ sha: string; author: { login: string } | null }[]>(`/repos/${repo}/pulls/${n}/commits?per_page=100`),
    gh<{ user: { login: string } | null; body: string }[]>(`/repos/${repo}/issues/${n}/comments?per_page=100`),
    gh<{ event: string; actor: { login: string } | null; label?: { name: string } }[]>(`/repos/${repo}/issues/${n}/events?per_page=100`),
    gh<{ commit: { message: string; committer: { date: string } } }[]>(`/repos/${repo}/commits?sha=main&since=${pr.merged_at}&until=${new Date(Date.parse(pr.merged_at as string) + 86_400_000).toISOString()}&per_page=100`),
  ]);
  // shortcut: nur die letzten 20 Commits des PR zählen für den ersten build-Lauf, bei längeren PRs ausbauen.
  const builds = (await Promise.all(commits.slice(0, 20).map((c) => gh<{ check_runs: { completed_at: string | null; conclusion: string | null }[] }>(`/repos/${repo}/commits/${c.sha}/check-runs?check_name=${CHECK}`)))).flatMap((r) => r.check_runs).filter((c) => c.completed_at && c.conclusion).map((c) => ({ fertig: c.completed_at as string, ergebnis: c.conclusion as string }));
  const titel = pr.title.split("\n")[0];
  // shortcut: Kommentare und Labels des Loops laufen mit dem Owner-Token; sie zählen hier nur, wenn sie keine Loop-Marker tragen bzw. Freigabe-Labels sind.
  const eingriffe = [
    ...commits.filter((c) => c.author).map((c) => ({ von: c.author?.login ?? "", art: "push" })),
    ...kommentare.filter((k) => k.user && !k.body.trimStart().startsWith("<!--")).map((k) => ({ von: k.user?.login ?? "", art: "kommentar" })),
    ...pruefungen.filter((e) => e.event === "labeled" && e.actor && ["freigegeben", "no-automerge"].includes(e.label?.name ?? "")).map((e) => ({ von: e.actor?.login ?? "", art: "label" })),
  ];
  const meine = zeilen.filter((z) => (issue && z.issue === issue) || z.pr === n || z.step === "abnahme");
  const dispatch = meine.filter((z) => z.step === "dispatch" && z.issue === issue).map((z) => z.created_at).sort()[0] ?? null;
  const kosten = meine.filter((z) => z.issue === issue && z.cost !== null);
  return scoreAusPr({
    produkt, issue, pr: n, rolle: pr.head.ref.startsWith("codex") ? "codex" : "claude", start: dispatch, erstellt: pr.created_at, gemergt: pr.merged_at as string,
    dateien: dateien.map((f) => f.filename), workerPfade: await workerPfade(issue), builds, eingriffe,
    reverts: ereignisse.filter((c) => c.commit.message.startsWith("Revert") && c.commit.message.includes(titel)).map((c) => c.commit.committer.date),
    ereignisse: meine, owner: OWNER, kostenUsd: kosten.length ? kosten.reduce((s, z) => s + (z.cost as number), 0) : null, kursUsdEur: kurs, jetzt,
  });
}

async function main() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return console.warn("::warning::Kein Score: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt.");
  const neu: { projekt: string; score: Score }[] = [];
  for (const p of produkte) {
    const zeilen = await sbLesen<Zeile>(`project=eq.${p.id}&created_at=gte.${ereignisSeit.toISOString()}&select=created_at,step,status,issue,pr,cost,grund&order=created_at&limit=2000`);
    const bewertet = await sbLesen<{ grund: string | null }>(`project=eq.${p.id}&step=eq.score&select=grund&order=created_at.desc&limit=1000`);
    const kandidaten: Score[] = [];
    for (const l of zeilen) {
      const s = Date.parse(l.created_at) >= seit.getTime() ? scoreAusLauf(p.id, l) : null;
      if (s) kandidaten.push(s);
    }
    const prs = (await gh<GhPr[]>(`/repos/${p.repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100`)).filter((x) => x.merged_at && Date.parse(x.merged_at) >= seit.getTime());
    for (const pr of prs) {
      try {
        kandidaten.push(await prScore(p.repo, p.id, pr, zeilen));
      } catch (e) {
        console.warn(`::warning::${p.id} PR ${pr.number} ohne Score: ${(e as Error).message}`);
      }
    }
    for (const s of kandidaten) if (!bereitsBewertet(bewertet, s)) neu.push({ projekt: p.id, score: s });
  }
  for (const { projekt, score } of neu) console.log(`${projekt} ${score.pr ? `PR ${score.pr}` : score.rolle}: direkt=${score.direkt}, Reparaturen=${score.reparatur_runden}, Prüfer=${score.pruefer_runden}, Eingriffe=${score.eingriffe_sinan}`);
  console.log(`${neu.length} neue Scores${DRY ? " (Trockenlauf, nichts geschrieben)" : ""}.`);
  if (DRY || !neu.length) return;
  const zeilen = neu.map(({ projekt, score }) => ({ project: projekt, agent: "score", step: "score", status: "ok", issue: score.issue, pr: score.pr, grund: scoreGrund(score) }));
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events`, { method: "POST", headers: { ...sbKopf(), "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(zeilen), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`loop_events schreiben: HTTP ${res.status} ${await res.text()}`);
}

main().catch((e: Error) => {
  console.error(`::error::${e.message}`);
  process.exit(1);
});
