/**
 * E2E-Strecke (SIN-1073). Aufruf: npx tsx scripts/e2e/strecke.ts
 * Liest Linear (Issues mit Änderung in den letzten 7 Tagen, 50 je Seite, 20 History-Einträge), loop_events, PR, PR-Kommentare und
 * Vercel-Status des Merge-Commits aus GitHub, rechnet src/lib/e2e/strecke.ts und schreibt `e2e` in die loop_snapshot-Zeile leitstand.
 * DRY_RUN=1: nur Ausgabe. Env: LINEAR_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GH_TOKEN (lesend), GITHUB_REPOSITORY.
 */
import { kennzahlen, linearAbfrage, type Ereignis, type IssueEingabe, type PrEingabe } from "../../src/lib/e2e/strecke";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const REPO = env.GITHUB_REPOSITORY ?? "siinanXD/Leitstand";
const GH = { Authorization: `Bearer ${env.GH_TOKEN ?? ""}`, Accept: "application/vnd.github+json" };

type Knoten = {
  identifier: string;
  createdAt: string;
  completedAt: string | null;
  attachments: { nodes: { url: string }[] };
  history: { nodes: { createdAt: string; toState: { name: string } | null }[] };
};

async function linear(): Promise<Knoten[]> {
  if (!env.LINEAR_API_KEY) throw new Error("LINEAR_API_KEY fehlt");
  const alle: Knoten[] = [];
  let nach: string | null = null;
  do {
    const res: Response = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { "Content-Type": "application/json", Authorization: env.LINEAR_API_KEY }, body: JSON.stringify(linearAbfrage("-P7D", nach)) });
    const json = (await res.json()) as { data?: { issues: { nodes: Knoten[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }; errors?: unknown };
    if (!res.ok || json.errors || !json.data) throw new Error(`Linear: ${res.status} ${JSON.stringify(json.errors ?? "")}`);
    alle.push(...json.data.issues.nodes);
    nach = json.data.issues.pageInfo.hasNextPage ? json.data.issues.pageInfo.endCursor : null;
  } while (nach);
  return alle;
}

async function ereignisse(): Promise<Ereignis[]> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt");
  const ab = new Date(Date.now() - 8 * 86_400_000).toISOString();
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events?project=eq.leitstand&created_at=gte.${ab}&select=created_at,step,status,issue,pr&order=created_at.desc&limit=5000`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error(`loop_events lesen: ${res.status}`);
  return (await res.json()) as Ereignis[];
}

async function gh<T>(pfad: string): Promise<T | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/${pfad}`, { headers: GH });
  return res.ok ? ((await res.json()) as T) : null;
}

/** PR aus dem Linear-Anhang; fehlt der Token oder die Antwort, bleibt die Station leer (kein Raten). */
async function pr(urls: string[]): Promise<PrEingabe | null> {
  const nummer = urls.map((u) => u.match(/\/pull\/(\d+)/)?.[1]).find(Boolean);
  if (!nummer || !env.GH_TOKEN) return null;
  const p = await gh<{ created_at: string; merged_at: string | null; merge_commit_sha: string | null }>(`pulls/${nummer}`);
  if (!p) return null;
  const kommentare = (await gh<{ body: string; created_at: string }[]>(`issues/${nummer}/comments?per_page=100`)) ?? [];
  const deploys = p.merge_commit_sha ? ((await gh<{ context: string; description: string | null; created_at: string }[]>(`commits/${p.merge_commit_sha}/statuses?per_page=100`)) ?? []) : [];
  return { nummer: Number(nummer), erstelltAm: p.created_at, mergedAm: p.merged_at, kommentare: kommentare.map((k) => ({ body: k.body, createdAt: k.created_at })), deploys };
}

async function main() {
  const ev = await ereignisse();
  const issues: IssueEingabe[] = [];
  for (const k of await linear()) {
    // shortcut: History auf 20 Einträge begrenzt; fehlt dort „Todo“ (direkt in Todo angelegt oder langer Verlauf), gilt createdAt als früheste Grenze.
    const todo = k.history.nodes.filter((h) => h.toState?.name === "Todo").map((h) => h.createdAt).sort()[0] ?? k.createdAt;
    issues.push({ kennung: k.identifier, todoAm: todo, doneAm: k.completedAt, ereignisse: ev, pr: await pr(k.attachments.nodes.map((a) => a.url)) });
  }
  const r = kennzahlen(issues, new Date());
  console.log(JSON.stringify(r, null, 2));
  if (DRY) return;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_snapshot?on_conflict=project`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ project: "leitstand", e2e: r }),
  });
  if (!res.ok) throw new Error(`loop_snapshot schreiben: ${res.status} ${await res.text()}`);
  // Schritt e2e-strecke in loop_events, damit die Rolle im Leitstand geprüft wird.
  const ereignis = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ project: "leitstand", step: "e2e-strecke", status: "ok", grund: `${r.vollstaendig}/${r.issues} Issues auf der ganzen Strecke` }),
  });
  if (!ereignis.ok) throw new Error(`loop_events schreiben: ${ereignis.status} ${await ereignis.text()}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
