/**
 * CEO-Agent (SIN-542). Aufruf aus ceo.yml (Vorlage: docs/ceo/ceo.yml.vorlage):
 *
 *   CEO_AUSLOESER=vorrat|bereitschaft|rot|taeglich npx tsx scripts/ceo/ceo.ts
 *
 * Liest loop_snapshot und loop_events (Supabase) und GitHub (gemergte Meta-PRs), entscheidet je Produkt genau eine Sache
 * (src/lib/ceo/ceo.ts) und schreibt eine Zeile in `ceo_entscheidungen` sowie ein Ereignis `rolle_gestartet` in `loop_events`.
 * Kein KI-Aufruf. Kein Geld, keine DB-Änderung, keine Freigabe.
 *
 * Entscheidet für alle Produkte mit Repo (fehlt die Snapshot-Zeile: warten, „keine Daten“). Bei weiterbauen mit auffuellen > 0 legt er
 * für den Leitstand Linear-Issues aus docs/FERTIG.md an (LINEAR_API_KEY) und stößt für die Lern-App planner.yml an (GH_TOKEN mit Actions-Schreibrecht).
 *
 * Env: GH_TOKEN (AGENT_WORKFLOW_TOKEN), LINEAR_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CEO_AUSLOESER, CEO_ROT (optional: "produkt=Grund;…" aus Live-Check/Sentry).
 * DRY_RUN=1 oder fehlende Supabase-Variablen: nur Ausgabe im Log, nichts geschrieben.
 */
import { readFile } from "node:fs/promises";
import { AUSLOESER, ereignisZeile, entscheide, entscheidungsZeile, gedaechtnisZeile, ohneDaten, startbar, type Ausloeser, type Entscheidung, type ProduktLage } from "../../src/lib/ceo/ceo";
import { neueIssueTitel } from "../../src/lib/ceo/fertig";
import { REPOS } from "../../src/lib/freigabe";
import { PROJEKTE } from "../../src/lib/projekte";
import { parseEvents, parseSnapshot, type LoopEvent, type SnapshotRow } from "../../src/lib/uebersicht";
import { fortschritt } from "../../src/lib/uebersicht-einfach";
import { aufgabenFuerDich } from "../../src/lib/uebersicht-b1";
import { wartendePrs } from "../../src/lib/wartende-prs";

const env = process.env;
const DRY = env.DRY_RUN === "1" || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY;
const ausloeser: Ausloeser = AUSLOESER.find((a) => a === env.CEO_AUSLOESER) ?? "taeglich";
const META = /^\w+\((loop|meta|waechter|gedaechtnis|ceo|agenten)\)/i;
const ROT = /fail|error|abort|crash|red|rot|stuck|timeout/i;
const TAG = 24 * 3_600_000;
const MEILENSTEIN = "v1 Grundgerüst";

const kopf = { apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? "", Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`, "Content-Type": "application/json" };
async function supabase(pfad: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${pfad}`, { method: body ? "POST" : "GET", headers: kopf, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`Supabase ${pfad.split("?")[0]}: ${res.status}`);
  return body ? null : res.json();
}

/** Heute gemergte Loop-/Meta-PRs je Repo. Ohne Token oder bei Fehler 0: die Regel greift dann nicht, ist aber im Log vermerkt. */
async function metaPrsHeute(repo: string | undefined, seit: Date): Promise<number> {
  if (!repo || !env.GH_TOKEN) return 0;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=50`, { headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json" } });
    if (!res.ok) return 0;
    const liste = (await res.json()) as { title: string; merged_at: string | null }[];
    return liste.filter((p) => p.merged_at && new Date(p.merged_at) >= seit && META.test(p.title)).length;
  } catch {
    return 0;
  }
}

/** `CEO_ROT="lernapp=die kaputte Live-Prüfung;leitstand=Sentry"`; zusätzlich ein rotes Ereignis eines Live-Checks oder von Sentry in den Daten. */
function rotVon(id: string, name: string, events: LoopEvent[]): string | null {
  const gesetzt = (env.CEO_ROT ?? "").split(";").map((s) => s.split("=")).find(([k]) => k.trim() === id)?.[1]?.trim();
  if (gesetzt) return gesetzt;
  const neuestes = events.find((e) => e.project === id && /live|sentry/i.test(e.step ?? ""));
  return neuestes?.status && ROT.test(neuestes.status) ? `die rote ${/sentry/i.test(neuestes.step ?? "") ? "Sentry-Meldung" : "Live-Prüfung"} von ${name}` : null;
}

// ------------------------------------------------------------------ Auffüllen (SIN-572)

const LERNAPP_REPO = PROJEKTE.find((x) => x.id === "lernapp")?.repo;

async function linear<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { "Content-Type": "application/json", Authorization: env.LINEAR_API_KEY ?? "" }, body: JSON.stringify({ query, variables }) });
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (!res.ok || json.errors) throw new Error(`Linear: ${res.status} ${JSON.stringify(json.errors ?? "")}`);
  return json.data as T;
}

/** Leitstand: bis zu n Issues aus den offenen Punkten in docs/FERTIG.md (Backlog, Label claude, Meilenstein „v1 Grundgerüst“); der Dispatcher rückt nach. Lern-App: Planer anstoßen. */
async function auffuellen(produkt: string, n: number) {
  if (produkt === "lernapp") {
    console.log(`${DRY ? "[trocken] " : ""}lernapp: Planer anstoßen (planer.yml, dry_run=false)`);
    if (DRY || !LERNAPP_REPO) return;
    const res = await fetch(`https://api.github.com/repos/${LERNAPP_REPO}/actions/workflows/planner.yml/dispatches`, { method: "POST", headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json" }, body: JSON.stringify({ ref: "main", inputs: { dry_run: "false" } }) });
    if (!res.ok) throw new Error(`planner.yml anstoßen: ${res.status}`);
    return;
  }
  if (produkt !== "leitstand") return;
  const md = await readFile("docs/FERTIG.md", "utf8").catch(() => "");
  if (DRY || !env.LINEAR_API_KEY) {
    console.log(`[trocken] leitstand: bis zu ${n} Issues aus FERTIG.md: ${neueIssueTitel(md, [], n).join(" | ") || "keine offenen Punkte"}`);
    return;
  }
  const d = await linear<{ projects: { nodes: { id: string; name: string; teams: { nodes: { id: string }[] }; projectMilestones: { nodes: { id: string; name: string }[] }; issues: { nodes: { title: string }[] } }[] } }>(
    `query { projects(filter: { name: { eq: "Leitstand" } }) { nodes { id name teams(first: 1) { nodes { id } } projectMilestones(first: 20) { nodes { id name } }
      issues(first: 250, filter: { state: { type: { nin: ["completed", "canceled"] } } }) { nodes { title } } } } }`,
  );
  const projekt = d.projects.nodes[0];
  const teamId = projekt?.teams.nodes[0]?.id;
  if (!projekt || !teamId) throw new Error("Linear-Projekt „Leitstand“ nicht gefunden");
  const titel = neueIssueTitel(md, projekt.issues.nodes.map((i) => i.title), n);
  if (!titel.length) return console.log("leitstand: keine neuen Punkte in docs/FERTIG.md");
  const t = await linear<{ team: { states: { nodes: { id: string; name: string }[] }; labels: { nodes: { id: string; name: string }[] } } }>(`query($t: String!) { team(id: $t) { states { nodes { id name } } labels(first: 250) { nodes { id name } } } }`, { t: teamId });
  const stateId = t.team.states.nodes.find((s) => s.name === "Backlog")?.id;
  const labelId = t.team.labels.nodes.find((l) => l.name.toLowerCase() === "claude")?.id;
  if (!stateId || !labelId) throw new Error("Status „Backlog“ oder Label „claude“ in Linear nicht gefunden");
  const meilensteinId = projekt.projectMilestones.nodes.find((m) => m.name === MEILENSTEIN)?.id;
  for (const title of titel) {
    await linear(`mutation($i: IssueCreateInput!) { issueCreate(input: $i) { success } }`, { i: { teamId, projectId: projekt.id, projectMilestoneId: meilensteinId, title, description: "Offener Punkt aus docs/FERTIG.md (angelegt vom CEO, SIN-572).", labelIds: [labelId], stateId } });
    console.log(`leitstand: Issue angelegt: ${title}`);
  }
}

async function main() {
  const jetzt = new Date();
  const snapshot: SnapshotRow[] = !env.SUPABASE_URL ? [] : parseSnapshot(await supabase("loop_snapshot?select=*&limit=200"));
  const events = !env.SUPABASE_URL ? [] : parseEvents(await supabase(`loop_events?select=*&created_at=gte.${new Date(jetzt.getTime() - 7 * TAG).toISOString()}&order=created_at.desc&limit=1000`));
  const letzte24 = events.filter((e) => Date.parse(e.created_at) >= jetzt.getTime() - TAG);
  const stand = new Map(fortschritt({ events: letzte24, snapshot }).map((f) => [f.project, f]));
  const aufgaben = aufgabenFuerDich(snapshot);
  const wartend = wartendePrs(snapshot);

  // Alle Produkte mit Repo (SIN-572), nicht nur die mit Snapshot-Zeile. Ohne Zeile: warten, „keine Daten“.
  const lagen: ProduktLage[] = [];
  const ohne: Entscheidung[] = [];
  for (const p of PROJEKTE.filter((x) => x.repo)) {
    if (!snapshot.some((s) => s.project === p.id)) {
      ohne.push(ohneDaten(p.id, p.name));
      continue;
    }
    const ids = new Set(snapshot.filter((s) => s.project === p.id).map((s) => s.issue ?? `#${s.pr}`));
    lagen.push({
      id: p.id,
      name: p.name,
      startbar: startbar(snapshot, p.id),
      fertig: stand.get(p.id)?.fertig ?? null,
      gesamt: stand.get(p.id)?.gesamt ?? null,
      rot: rotVon(p.id, p.name, events),
      wartetAufSinan: [...aufgaben.filter((a) => ids.has(a.ref)).map((a) => `${a.ref} ${a.titel}`), ...wartend.filter((w) => REPOS[w.repo].projekt === p.id).map((w) => `PR #${w.nummer}`)],
      metaPrsHeute: await metaPrsHeute(p.repo, new Date(jetzt.getTime() - TAG)),
      ideenDieseWoche: events.filter((e) => e.project === p.id && /^idee$/i.test(e.step ?? "")).length,
    });
  }

  const tag = jetzt.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  // Nach einem Merge oder einer Änderung der Bereitschaftsliste schreibt der CEO nur, wenn er etwas zu planen hat; täglich und bei Rot immer.
  const schreibenSoll = (e: Entscheidung) => ausloeser === "taeglich" || ausloeser === "rot" || e.auffuellen > 0 || e.art !== "weiterbauen";
  for (const e of [...ohne, ...lagen.map(entscheide)]) {
    if (!schreibenSoll(e)) continue;
    console.log(`${gedaechtnisZeile(e, tag)} (Auslöser: ${ausloeser}, auffüllen: ${e.auffuellen}, Meta: ${e.metaErlaubt ? "ja" : "nein"}, Ideen: ${e.ideenErlaubt ? "ja" : "nein"})`);
    if (DRY) continue;
    const run = env.GITHUB_RUN_ID;
    await supabase("ceo_entscheidungen", entscheidungsZeile(e, ausloeser, null));
    await supabase("loop_events", ereignisZeile(e.produkt, run ?? null, run ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${run}` : null));
  }
  for (const e of lagen.map(entscheide)) {
    if (e.art === "weiterbauen" && e.auffuellen > 0) await auffuellen(e.produkt, e.auffuellen);
  }
  if (DRY) console.log("Trockenlauf: nichts geschrieben.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
