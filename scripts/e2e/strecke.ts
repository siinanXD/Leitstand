/**
 * Ende-zu-Ende-Nachweis (SIN-1054). Aufruf: npx tsx scripts/e2e/strecke.ts
 * Liest Linear (Issues des Projekts „Leitstand“ der letzten 7 Tage) und loop_events, rechnet src/lib/e2e/strecke.ts,
 * schreibt e2e in die loop_snapshot-Zeile leitstand und legt bei 0 erfolgreichen Issues höchstens ein Kanarien-Issue an.
 * DRY_RUN=1: nur Ausgabe, nichts schreiben. Env: LINEAR_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import type { Ereignis } from "../../src/lib/kennzahlen/durchstich";
import { kanarieNoetig, kennzahl, KANARIE_LABEL, stationen, zeile, type StreckeIssue } from "../../src/lib/e2e/strecke";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const TAGE = 7;

type Knoten = {
  id: string;
  identifier: string;
  completedAt: string | null;
  state: { name: string; type: string };
  team: { id: string };
  project: { id: string } | null;
  labels: { nodes: { name: string }[] };
  history: { nodes: { createdAt: string; toState: { name: string } | null }[] };
};

async function linear<T>(query: string, variables: object = {}): Promise<T> {
  if (!env.LINEAR_API_KEY) throw new Error("LINEAR_API_KEY fehlt");
  const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { "Content-Type": "application/json", Authorization: env.LINEAR_API_KEY }, body: JSON.stringify({ query, variables }) });
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (!res.ok || json.errors || !json.data) throw new Error(`Linear: ${res.status} ${JSON.stringify(json.errors ?? "")}`);
  return json.data;
}

const ABFRAGE = `query($ab: DateTimeOrDuration!) { issues(first: 250, filter: { project: { name: { eq: "Leitstand" } }, or: [{ completedAt: { gte: $ab } }, { createdAt: { gte: $ab } }, { state: { type: { eq: "started" } } }] }, orderBy: updatedAt) {
  nodes { id identifier completedAt state { name type } team { id } project { id } labels { nodes { name } } history(first: 100) { nodes { createdAt toState { name } } } } } }`;

async function ereignisse(): Promise<Ereignis[]> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt");
  const ab = new Date(Date.now() - (TAGE + 1) * 86_400_000).toISOString();
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events?project=eq.leitstand&created_at=gte.${ab}&select=created_at,step,status,issue,pr,grund&limit=10000`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error(`loop_events lesen: ${res.status}`);
  return (await res.json()) as Ereignis[];
}

/** Erster Wechsel nach „Todo“ im Verlauf; ohne Verlauf kein Todo-Zeitpunkt (Station fehlt, kein erfundener Wert). */
const todoAm = (k: Knoten) => k.history.nodes.filter((h) => h.toState?.name === "Todo").map((h) => h.createdAt).sort()[0] ?? null;

async function kanarieAnlegen(k: Knoten) {
  const t = await linear<{ team: { labels: { nodes: { id: string; name: string }[] }; states: { nodes: { id: string; name: string }[] } } }>(
    `query($t: String!) { team(id: $t) { labels { nodes { id name } } states { nodes { id name } } } }`,
    { t: k.team.id },
  );
  const label = t.team.labels.nodes.filter((l) => [KANARIE_LABEL, "claude"].includes(l.name)).map((l) => l.id);
  const stateId = t.team.states.nodes.find((s) => s.name === "Todo")?.id;
  const heute = new Date().toISOString().slice(0, 10);
  await linear(`mutation($i: IssueCreateInput!) { issueCreate(input: $i) { success } }`, {
    i: {
      teamId: k.team.id,
      projectId: k.project?.id,
      stateId,
      labelIds: label,
      title: `Kanarie ${heute}: Build-Datum im Fußbereich`,
      description: `Wöchentlicher Kanarienlauf (SIN-1054): kein Issue der letzten ${TAGE} Tage erreichte alle Stationen.\n\nÄndere nur eine sichtbare Zeile (Build-Datum im Fußbereich auf ${heute}). Probe: HTTP gegen die Produktions-URL enthält das Datum.\n\n<!-- worker-pfade: ["src/app/rahmen.tsx"] -->`,
    },
  });
}

/** Trockenlauf in CI ohne Zugangsdaten: ein Fixture-Issue, das alle Stationen erreicht. */
function fixture(): { d: { issues: { nodes: Knoten[] } }; ev: Ereignis[] } {
  const t = (h: number) => new Date(Date.now() - (10 - h) * 3_600_000).toISOString();
  const knoten: Knoten = { id: "x", identifier: "SIN-0", completedAt: t(8), state: { name: "Done", type: "completed" }, team: { id: "t" }, project: null, labels: { nodes: [] }, history: { nodes: [{ createdAt: t(0), toState: { name: "Todo" } }] } };
  const e = (h: number, step: string, status: string, issue: string | null, pr: number | null): Ereignis => ({ created_at: t(h), step, status, issue, pr });
  return { d: { issues: { nodes: [knoten] } }, ev: [e(1, "worker", "start", "SIN-0", null), e(2, "worker", "ok", "SIN-0", 1), e(3, "pruefer", "ok", null, 1), e(4, "merge", "ok", null, 1), e(5, "deploy", "ok", null, 1), e(6, "abnahme", "ok", "SIN-0", null)] };
}

async function main() {
  const ohneZugang = DRY && !env.LINEAR_API_KEY;
  const { d, ev } = ohneZugang ? fixture() : { d: await linear<{ issues: { nodes: Knoten[] } }>(ABFRAGE, { ab: `-P${TAGE}D` }), ev: await ereignisse() };
  const jetzt = Date.now();
  const issues = d.issues.nodes.map((k) => ({ k, i: { kennung: k.identifier, todoAm: todoAm(k), doneAm: k.completedAt, labels: k.labels.nodes.map((l) => l.name), offen: k.state.type !== "completed" && k.state.type !== "canceled" } satisfies StreckeIssue }));
  // Nur Issues mit Todo-Zeitpunkt im Fenster; so zählen alte, hängende Issues nicht doppelt in jeder Woche.
  const imFenster = issues.filter(({ i }) => i.todoAm && jetzt - Date.parse(i.todoAm) <= TAGE * 86_400_000);
  const kz = kennzahl(imFenster.map(({ i }) => stationen(i, ev)));
  const noetig = kanarieNoetig(kz, issues.map(({ i }) => i));
  console.log(JSON.stringify({ ...kz, zeile: zeile(kz), kanarie: noetig }, null, 2));
  if (DRY) return;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt");
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_snapshot?on_conflict=project`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ project: "leitstand", e2e: { ...kz, stand: new Date(jetzt).toISOString() } }),
  });
  if (!res.ok) throw new Error(`loop_snapshot schreiben: ${res.status} ${await res.text()}`);
  // Heartbeat für die Rolle e2e-strecke (rollen.json) und die Abnahme-Probe.
  const hb = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ project: "leitstand", agent: "betrieb", step: "e2e-strecke", status: "ok", issue: null, pr: null, run_id: env.GITHUB_RUN_ID ?? null }),
  });
  if (!hb.ok) console.log(`::warning::loop_event nicht geschrieben: ${hb.status}`);
  const vorlage = d.issues.nodes[0];
  if (noetig && vorlage) await kanarieAnlegen(vorlage);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
