/**
 * Visionär (SIN-573), zweiter Teil nach dem KI-Lauf. Aufruf aus visionaer.yml (Vorlage: docs/visionaer/visionaer.yml.vorlage):
 *
 *   npx tsx scripts/visionaer/visionaer.ts <produkt> <datei>
 *
 * <datei> ist die Ausgabe der Rolle nach docs/schemas/visionaer.json. Das Skript glaubt ihr nicht: Schema, 3 bis 7 Fertig-Punkte
 * und „nie zwei offene Versionen“ werden geprüft, sonst entsteht nichts. Dann: Abschnitt in docs/VERSIONEN.md (Ordner VERSIONEN_DIR, Standard .),
 * Linear-Meilenstein „v2 <Name>“ mit den passenden `idee`-Issues, Ereignis VERSION `vorschlag` (wartet auf Sinans Go) oder `go` (nur Fehlerbehebungen).
 * Bei `pause` und `abschliessen` bleibt der Stand `pause`: nichts wird gebaut.
 *
 * Env: LINEAR_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VERSIONEN_DIR. DRY_RUN=1 oder fehlende Variablen: nur Ausgabe im Log.
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { pruefeSchema, type Schema } from "../../src/lib/autonomy/schema";
import { projektInfo } from "../../src/lib/projekte";
import { brauchtGo, pruefeVersion, standZeile, staende, versionAbschnitt, vorschlagText, type Version, type Vorschlag } from "../../src/lib/visionaer/visionaer";

const env = process.env;
const DRY = env.DRY_RUN === "1" || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.LINEAR_API_KEY;
const [produkt, datei] = process.argv.slice(2);

const kopf = { apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? "", Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`, "Content-Type": "application/json" };
async function supabase(pfad: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${pfad}`, { method: body ? "POST" : "GET", headers: kopf, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`Supabase ${pfad.split("?")[0]}: ${res.status}`);
  return body ? null : res.json();
}

async function linear<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { "Content-Type": "application/json", Authorization: env.LINEAR_API_KEY ?? "" }, body: JSON.stringify({ query, variables }) });
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (!res.ok || json.errors) throw new Error(`Linear: ${res.status} ${JSON.stringify(json.errors ?? "")}`);
  return json.data as T;
}

/** Meilenstein „v2 <Name>“ im Linear-Projekt des Produkts anlegen (gibt es ihn schon, wird er benutzt) und die `idee`-Issues hineinschieben. Der Rest bleibt `idee`. */
async function meilenstein(v: Version) {
  const d = await linear<{ projects: { nodes: { id: string; projectMilestones: { nodes: { id: string; name: string }[] } }[] } }>(
    `query($n: String!) { projects(filter: { name: { eq: $n } }) { nodes { id projectMilestones(first: 50) { nodes { id name } } } } }`,
    { n: projektInfo(produkt).name },
  );
  const p = d.projects.nodes[0];
  if (!p) throw new Error(`Linear-Projekt „${projektInfo(produkt).name}“ nicht gefunden`);
  let id = p.projectMilestones.nodes.find((m) => m.name === v.name)?.id;
  if (!id) id = (await linear<{ projectMilestoneCreate: { projectMilestone: { id: string } } }>(`mutation($i: ProjectMilestoneCreateInput!) { projectMilestoneCreate(input: $i) { projectMilestone { id } } }`, { i: { projectId: p.id, name: v.name } })).projectMilestoneCreate.projectMilestone.id;
  for (const issue of v.idee_issues) {
    await linear(`mutation($id: String!, $m: String!) { issueUpdate(id: $id, input: { projectMilestoneId: $m }) { success } }`, { id: issue, m: id });
    console.log(`${issue} → ${v.name}`);
  }
}

async function main() {
  if (!produkt || !datei || !/^[a-z]+$/.test(produkt)) throw new Error("Aufruf: npx tsx scripts/visionaer/visionaer.ts <produkt> <datei>");
  const ergebnis = JSON.parse(await readFile(datei, "utf8")) as { produkt: string; vorschlag: Vorschlag; versionen: Version[] };
  const schema = JSON.parse(await readFile("docs/schemas/visionaer.json", "utf8")) as Schema;
  const fehler = pruefeSchema(ergebnis, schema);
  if (ergebnis.produkt !== produkt) fehler.push(`produkt: ${ergebnis.produkt} statt ${produkt}`);
  const stand = DRY ? undefined : staende(await supabase(`loop_events?select=project,step,status,grund,created_at&project=eq.${produkt}&step=eq.VERSION&order=created_at.desc&limit=20`)).find((s) => s.produkt === produkt);
  // „Offen“ heißt: freigegeben und noch nicht fertig, oder vorgeschlagen und noch nicht freigegeben.
  const offen = stand?.status === "go" || stand?.status === "vorschlag" ? stand.name : null;
  const v = ergebnis.vorschlag === "naechste_version" ? ergebnis.versionen[0] : undefined;
  if (ergebnis.vorschlag === "naechste_version") {
    if (ergebnis.versionen.length !== 1) fehler.push("genau eine Version erwartet");
    else fehler.push(...pruefeVersion(v!, offen));
  }
  if (fehler.length) throw new Error(`Ausgabe abgelehnt:\n- ${fehler.join("\n- ")}`);
  if (!v) return console.log(`${produkt}: Vorschlag ${ergebnis.vorschlag}, nichts wird gebaut (Stand bleibt pause).`);

  const status = brauchtGo(v) ? "vorschlag" : "go";
  console.log(`${DRY ? "[trocken] " : ""}${produkt}: ${v.name} (${status})\n${versionAbschnitt(v)}`);
  if (DRY) return;
  const ordner = env.VERSIONEN_DIR ?? ".";
  await mkdir(`${ordner}/docs`, { recursive: true });
  await appendFile(`${ordner}/docs/VERSIONEN.md`, `${versionAbschnitt(v)}\n`);
  await meilenstein(v);
  await supabase("loop_events", standZeile(produkt, status, vorschlagText(v)));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
