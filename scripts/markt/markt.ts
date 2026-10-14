/**
 * Markt-Agent (SIN-554). Aufruf aus markt.yml (.github/workflows/markt.yml), am 1. des Monats, nach dem Suchlauf:
 *
 *   npx tsx scripts/markt/markt.ts
 *
 * Liest markt-ergebnis.json (Form: `Ergebnis` in src/lib/markt/markt.ts, vom Suchlauf mit WebSearch/WebFetch geschrieben),
 * prüft es, schreibt docs/markt/<YYYY-MM>.md und legt höchstens 3 Linear-Issues an: Label `idee`, Meilenstein „v2 Ideen“, Status Backlog,
 * keine Priorität (nie `dringend`). Die Datei committet der Workflow.
 *
 * Env: LINEAR_API_KEY, MARKT_LINEAR_PROJEKT (Name des Linear-Projekts), MARKT_MONAT (JJJJ-MM, Standard: aktueller Monat),
 * MARKT_ERGEBNIS (Standard: markt-ergebnis.json), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (optional, für loop_events).
 * DRY_RUN=1: nur Log, keine Datei, kein Issue.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { ereignisZeile, IDEE_LABEL, IDEE_MEILENSTEIN, ideeBeschreibung, istMonat, leseErgebnis, markdown, pfad } from "../../src/lib/markt/markt";

const env = process.env;
const DRY = env.DRY_RUN === "1";

async function linear<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (!env.LINEAR_API_KEY) throw new Error("LINEAR_API_KEY fehlt");
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: env.LINEAR_API_KEY },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (!res.ok || j.errors || !j.data) throw new Error(`Linear: ${j.errors?.map((e) => e.message).join("; ") ?? res.status}`);
  return j.data;
}

type Projekt = { id: string; teams: { nodes: { id: string; states: { nodes: { id: string; name: string }[] }; labels: { nodes: { id: string; name: string }[] } }[] }; projectMilestones: { nodes: { id: string; name: string }[] }; issues: { nodes: { title: string }[] } };

async function ideenAnlegen(titel: { titel: string; beschreibung: string }[]): Promise<number> {
  const name = env.MARKT_LINEAR_PROJEKT;
  if (!name) throw new Error("MARKT_LINEAR_PROJEKT fehlt");
  const d = await linear<{ projects: { nodes: Projekt[] } }>(
    `query($n: String!) { projects(filter: { name: { eq: $n } }, first: 1) { nodes { id teams { nodes { id states { nodes { id name } } labels(first: 250) { nodes { id name } } } } projectMilestones { nodes { id name } } issues(first: 250) { nodes { title } } } } }`,
    { n: name },
  );
  const p = d.projects.nodes[0];
  const team = p?.teams.nodes[0];
  const backlog = team?.states.nodes.find((s) => s.name === "Backlog");
  const label = team?.labels.nodes.find((l) => l.name.toLowerCase() === IDEE_LABEL);
  const meilenstein = p?.projectMilestones.nodes.find((m) => m.name === IDEE_MEILENSTEIN);
  if (!p || !team || !backlog || !label || !meilenstein) throw new Error(`Projekt „${name}“, Status „Backlog“, Label „${IDEE_LABEL}“ oder Meilenstein „${IDEE_MEILENSTEIN}“ in Linear nicht gefunden`);
  let n = 0;
  for (const i of titel) {
    if (p.issues.nodes.some((x) => x.title === i.titel)) continue; // Wiederholung des Laufs legt nichts doppelt an
    if (DRY) console.log(`[trocken] Idee: ${i.titel}`);
    else await linear(`mutation($i: IssueCreateInput!) { issueCreate(input: $i) { success } }`, { i: { teamId: team.id, projectId: p.id, projectMilestoneId: meilenstein.id, stateId: backlog.id, labelIds: [label.id], title: i.titel, description: i.beschreibung } });
    n++;
  }
  return n;
}

async function ereignis(zeile: unknown): Promise<void> {
  if (DRY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return console.warn("Ereignis nicht geschrieben (trocken oder Supabase-Variablen fehlen)");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(zeile) });
  if (!res.ok) throw new Error(`Supabase loop_events: ${res.status}`);
}

async function main() {
  const monat = env.MARKT_MONAT ?? new Date().toISOString().slice(0, 7);
  if (!istMonat(monat)) throw new Error(`MARKT_MONAT ungültig: ${monat}`);
  const e = leseErgebnis(JSON.parse(readFileSync(env.MARKT_ERGEBNIS ?? "markt-ergebnis.json", "utf8")));
  if (!e) throw new Error("Ergebnis unvollständig (Belege fehlen oder weniger als 3 Anbieter), nichts geschrieben");
  if (DRY) console.log(markdown(e, monat));
  else writeFileSync(pfad(monat), markdown(e, monat));
  const n = await ideenAnlegen(e.ideen.map((i) => ({ titel: i.titel, beschreibung: ideeBeschreibung(i, monat) })));
  await ereignis(ereignisZeile(e.produkt, true, n));
  console.log(`${pfad(monat)}: ${e.eintraege.length} Einträge, ${n} Ideen im Backlog.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
