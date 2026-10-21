/**
 * SIN-919: Einmaliger Abgleich. Todo-Issues mit Label `claude` ohne `worker-pfade` bekommen einen Vorschlag aus ihrer Beschreibung.
 *   DRY_RUN=1 npx tsx scripts/loop/pfade-abgleich.ts            (nur Liste)
 *   npx tsx scripts/loop/pfade-abgleich.ts --apply               (schreibt den Block in Linear)
 * Env: LINEAR_API_KEY; ohne Key: Eingabe als JSON-Datei über PFADE_JSON (Liste aus {identifier, description}).
 * Unklare Issues (kein Pfad gefunden) bleiben ohne Block und laufen weiter allein.
 */
import { readFileSync } from "node:fs";
import { abgleichZeilen } from "../../src/lib/loop/parallel";

type Eintrag = { id?: string; identifier: string; description: string | null };
const env = process.env;
const APPLY = process.argv.includes("--apply") && env.DRY_RUN !== "1";

async function linear<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { "Content-Type": "application/json", Authorization: env.LINEAR_API_KEY! }, body: JSON.stringify({ query, variables }) });
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (!res.ok || json.errors) throw new Error(`Linear: ${res.status} ${JSON.stringify(json.errors ?? "")}`);
  return json.data as T;
}

async function lade(): Promise<Eintrag[]> {
  if (env.PFADE_JSON) return JSON.parse(readFileSync(env.PFADE_JSON, "utf8")) as Eintrag[];
  if (!env.LINEAR_API_KEY) throw new Error("LINEAR_API_KEY oder PFADE_JSON fehlt");
  const alle: Eintrag[] = [];
  for (let nach: string | null = null; ; ) {
    const d: { issues: { nodes: Eintrag[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } = await linear(
      `query($nach: String) { issues(first: 100, after: $nach, filter: { project: { name: { eq: "Leitstand" } }, state: { type: { eq: "unstarted" } }, labels: { name: { eq: "claude" } } }) { nodes { id identifier description } pageInfo { hasNextPage endCursor } } }`,
      { nach },
    );
    alle.push(...d.issues.nodes);
    if (!d.issues.pageInfo.hasNextPage) return alle;
    nach = d.issues.pageInfo.endCursor;
  }
}

async function main() {
  const alle = await lade();
  const zeilen = abgleichZeilen(alle);
  console.log(`${zeilen.length} Todo-Issues ohne worker-pfade`);
  for (const z of zeilen) {
    console.log(z.zeile);
    const i = alle.find((x) => x.identifier === z.identifier)!;
    if (!APPLY || !z.vorschlag.length || !i.id) continue;
    await linear(`mutation($id: String!, $d: String!) { issueUpdate(id: $id, input: { description: $d }) { success } }`, { id: i.id, d: `${i.description ?? ""}\n\n<!-- worker-pfade: ${JSON.stringify(z.vorschlag)} -->` });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
