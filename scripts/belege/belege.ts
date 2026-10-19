/**
 * Belege-Prüfer (SIN-846): Lese-Agent für Issues, deren offene Haken nur Belege sind.
 * Liest mit der Postgres-Rolle `pruefer_readonly` (SUPABASE_PRUEFER_URL) und der GitHub-API, nie mit Service-Role-Key.
 * Führt nur feste Proben aus (src/lib/belege/belege.ts), kein freies SQL. Trockenlauf: DRY_RUN=1.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { bewerte, leseProbe, nurBelege, type Probe } from "../../src/lib/belege/belege";
import { ausLinear } from "../../src/lib/loop/auswahl";
import { leseHaken, setzeHaken } from "../../src/lib/loop/haken";
import { ladeProjektIssues } from "../../src/lib/loop/projekt-issues";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const repo = env.GITHUB_REPOSITORY ?? "siinanXD/Leitstand";
const MARKER = "<!-- belege-pruefer -->";
const sh = promisify(execFile);

async function linear<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (!env.LINEAR_API_KEY) throw new Error("LINEAR_API_KEY fehlt");
  const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { "Content-Type": "application/json", Authorization: env.LINEAR_API_KEY }, body: JSON.stringify({ query, variables }) });
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (!res.ok || json.errors) throw new Error(`Linear: ${res.status} ${JSON.stringify(json.errors ?? "")}`);
  return json.data as T;
}

async function sql(abfrage: string): Promise<string> {
  if (!env.SUPABASE_PRUEFER_URL) throw new Error("SUPABASE_PRUEFER_URL fehlt");
  const { stdout } = await sh("psql", [env.SUPABASE_PRUEFER_URL, "-v", "ON_ERROR_STOP=1", "-tA", "-c", abfrage]);
  return stdout.trim();
}

/** Rolle muss lesen können und darf nirgends schreiben, sonst bricht der Lauf ab. */
async function leseprobe() {
  const schreib = await sql("select count(*) from information_schema.role_table_grants where grantee = current_user and table_schema = 'public' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')");
  if (schreib !== "0") throw new Error(`Rolle hat ${schreib} Schreibrechte, Abbruch`);
}

async function messe(p: Probe): Promise<{ wert: number | string; link: string }> {
  if (p.art === "zaehlung") return { wert: Number(await sql(`select count(*) from public."${p.tabelle}"`)), link: "" };
  if (!env.GH_TOKEN) throw new Error("GH_TOKEN fehlt");
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${p.workflow}/runs?per_page=1&status=completed`, { headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`GitHub ${p.workflow}: ${res.status}`);
  const r = ((await res.json()) as { workflow_runs: { conclusion: string; html_url: string }[] }).workflow_runs[0];
  return { wert: r?.conclusion ?? "kein Run", link: r?.html_url ?? "" };
}

async function main() {
  const knoten = await ladeProjektIssues(linear as never, "Leitstand");
  const kandidaten = knoten.filter((k) => k.state.type !== "backlog" && nurBelege(k.description) && (k.labels?.nodes ?? []).some((l) => l.name.toLowerCase() === "claude"));
  console.log(`${kandidaten.length} Issue(s) mit nur offenen Belege-Haken`);
  if (!kandidaten.length) return;
  await leseprobe();
  for (const k of kandidaten) {
    const i = ausLinear(k);
    const belegt: string[] = [];
    const offen: string[] = [];
    const zeilen: string[] = [];
    for (const h of leseHaken(i.description).filter((x) => !x.erledigt)) {
      const probe = leseProbe(h.text);
      if (!probe) { offen.push(`${h.text} (keine Probe im Haken)`); continue; }
      try {
        const { wert, link } = await messe(probe);
        const b = bewerte(probe, wert);
        const beleg = link ? `${b.beleg}, ${link}` : b.beleg;
        (b.belegt ? belegt : offen).push(b.belegt ? h.text : `${h.text} (${beleg})`);
        if (b.belegt) zeilen.push(`- [x] ${h.text}: ${beleg}`);
      } catch (e) {
        offen.push(`${h.text} (Probe scheiterte: ${e instanceof Error ? e.message.split("\n")[0] : "unbekannt"})`);
      }
    }
    const fertig = offen.length === 0;
    const text = [MARKER, fertig ? "Prüfer: alle Beleg-Haken belegt, Done." : "Prüfer: offen, weil", ...zeilen, ...offen.map((o) => `- [ ] ${o}`)].join("\n");
    if (DRY) { console.log(`[trocken] ${i.identifier}\n${text}`); continue; }
    const alt = await linear<{ issue: { comments: { nodes: { body: string }[] } } }>(`query($id: String!) { issue(id: $id) { comments(last: 20) { nodes { body } } } }`, { id: i.id });
    if (belegt.length && i.description) await linear(`mutation($id: String!, $d: String!) { issueUpdate(id: $id, input: { description: $d }) { success } }`, { id: i.id, d: setzeHaken(i.description, belegt) });
    // Gleicher Befund wie zuletzt: kein neuer Kommentar (der Prüfer läuft alle 2 h).
    if (!alt.issue.comments.nodes.some((c) => c.body === text)) await linear(`mutation($id: String!, $b: String!) { commentCreate(input: { issueId: $id, body: $b }) { success } }`, { id: i.id, b: text });
    if (fertig) {
      const s = await linear<{ team: { states: { nodes: { id: string; name: string }[] } } }>(`query($t: String!) { team(id: $t) { states { nodes { id name } } } }`, { t: k.team.id });
      const done = s.team.states.nodes.find((x) => x.name === "Done");
      if (done) await linear(`mutation($id: String!, $s: String!) { issueUpdate(id: $id, input: { stateId: $s }) { success } }`, { id: i.id, s: done.id });
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
