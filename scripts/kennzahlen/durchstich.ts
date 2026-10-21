/**
 * Kennzahl „Durchstich“ (SIN-897). Aufruf: npx tsx scripts/kennzahlen/durchstich.ts
 * Liest Linear (Issues des Projekts „Leitstand“, die in den letzten 48 h fertig wurden oder laufen – unabhängig vom aktuellen Label, Verlauf der Labels, Kommentare), loop_events der letzten 48 h
 * und den Merge-Autor aus GitHub, rechnet src/lib/kennzahlen/durchstich.ts und schreibt durchstich, mit_eingriff, haengt
 * in die loop_snapshot-Zeile leitstand. DRY_RUN=1: nur Ausgabe. Env: LINEAR_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * GH_TOKEN (lesend), GITHUB_REPOSITORY, SINAN_NAMEN (Komma, Standard „Sinan Kahraman,siinanXD“).
 */
import { durchstich, type Ereignis, type VerlaufIssue } from "../../src/lib/kennzahlen/durchstich";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const REPO = env.GITHUB_REPOSITORY ?? "siinanXD/Leitstand";
const SINAN = (env.SINAN_NAMEN ?? "Sinan Kahraman,siinanXD").split(",").map((s) => s.trim());

type LinearKnoten = {
  identifier: string;
  startedAt: string | null;
  completedAt: string | null;
  state: { type: string };
  labels: { nodes: { name: string }[] };
  history: { nodes: { addedLabels?: { name: string }[] | null }[] };
  comments: { nodes: { createdAt: string; user: { name: string } | null }[] };
  attachments: { nodes: { url: string }[] };
};

// Kein Filter auf das aktuelle Label `claude`: ein Issue, das das Label vor Done verlor, zählt trotzdem (mit Eingriff oder ohne Beleg).
const ABFRAGE = `query($ab: DateTimeOrDuration!) { issues(first: 250, filter: { project: { name: { eq: "Leitstand" } }, or: [{ completedAt: { gte: $ab } }, { state: { type: { eq: "started" } } }] }, orderBy: updatedAt) {
  nodes { identifier startedAt completedAt state { type } labels { nodes { name } }
    history(first: 100) { nodes { addedLabels { name } } } comments(first: 100) { nodes { createdAt user { name } } } attachments { nodes { url } } } } }`;

async function linear(): Promise<LinearKnoten[]> {
  if (!env.LINEAR_API_KEY) throw new Error("LINEAR_API_KEY fehlt");
  const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { "Content-Type": "application/json", Authorization: env.LINEAR_API_KEY }, body: JSON.stringify({ query: ABFRAGE, variables: { ab: "-P2D" } }) });
  const json = (await res.json()) as { data?: { issues: { nodes: LinearKnoten[] } }; errors?: unknown };
  if (!res.ok || json.errors || !json.data) throw new Error(`Linear: ${res.status} ${JSON.stringify(json.errors ?? "")}`);
  return json.data.issues.nodes;
}

/** Merge-Autor des PR, der am Linear-Issue hängt (Anhang mit /pull/<n>); null, wenn unbekannt oder nicht gemergt. */
async function mergeVon(urls: string[]): Promise<string | null> {
  const nr = urls.map((u) => u.match(/\/pull\/(\d+)/)?.[1]).find(Boolean);
  if (!nr || !env.GH_TOKEN) return null;
  const res = await fetch(`https://api.github.com/repos/${REPO}/pulls/${nr}`, { headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json" } });
  if (!res.ok) return null;
  return ((await res.json()) as { merged_by?: { login: string } | null }).merged_by?.login ?? null;
}

async function ereignisse(): Promise<Ereignis[]> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt");
  const ab = new Date(Date.now() - 48 * 3_600_000).toISOString();
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events?project=eq.leitstand&created_at=gte.${ab}&select=created_at,step,status,issue,pr,grund&limit=5000`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error(`loop_events lesen: ${res.status}`);
  return (await res.json()) as Ereignis[];
}

async function main() {
  const knoten = await linear();
  const issues: VerlaufIssue[] = [];
  for (const k of knoten) {
    issues.push({
      kennung: k.identifier,
      status: k.state.type === "completed" ? "done" : k.state.type === "started" ? "started" : "other",
      gestartetAm: k.startedAt,
      doneAm: k.completedAt,
      labelsImVerlauf: [...new Set([...k.labels.nodes.map((l) => l.name), ...k.history.nodes.flatMap((h) => (h.addedLabels ?? []).map((l) => l.name))])],
      kommentare: k.comments.nodes.filter((c) => c.user).map((c) => ({ autor: c.user!.name, am: c.createdAt })),
      mergeVon: k.state.type === "completed" ? await mergeVon(k.attachments.nodes.map((a) => a.url)) : null,
    });
  }
  const r = durchstich(issues, await ereignisse(), SINAN, new Date());
  console.log(JSON.stringify(r, null, 2));
  if (DRY) return;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt");
  const zeile = { project: "leitstand", durchstich: { tag: r.tag, liste: r.durchstich, quote: r.quote, ohne_beleg: r.ohne_beleg }, mit_eingriff: r.mit_eingriff, haengt: r.haengt };
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_snapshot?on_conflict=project`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(zeile),
  });
  if (!res.ok) throw new Error(`loop_snapshot schreiben: ${res.status} ${await res.text()}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
