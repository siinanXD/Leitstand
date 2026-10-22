/**
 * Auftrag aus Linear lesen (SIN-945): Der Worker darf keine Shell-Befehle mit $LINEAR_API_KEY ausführen,
 * deshalb liest dieses Skript das Issue selbst. Aufruf: npx tsx scripts/loop/auftrag.ts SIN-123
 * Ausgabe: Titel, Status, Labels, Blocker, die 5 neuesten Kommentare (ohne Pause) vor der Beschreibung, die letzten 10 loop_events (Lesekopie aus claude.yml). Nur lesend.
 */
import { readFileSync } from "node:fs";
import { formatiere, leseEreignisse, type Auftrag, type Ereignis } from "../../src/lib/loop/auftrag";

const id = process.argv[2] ?? "";
if (!/^SIN-\d+$/.test(id)) {
  console.error("Aufruf: npx tsx scripts/loop/auftrag.ts SIN-123");
  process.exit(2);
}
const key = process.env.LINEAR_API_KEY ?? "";
if (!key) {
  console.error("LINEAR_API_KEY fehlt im Job.");
  process.exit(3);
}
const query = `query($id: String!) { issue(id: $id) { identifier title url description state { name }
  labels { nodes { name } } inverseRelations { nodes { type issue { identifier state { name } } } }
  comments(last: 20) { nodes { createdAt body } } } }`;
/** Letzte 10 loop_events zum Issue (SIN-891): legt claude.yml vorab als Lesekopie ab, der Worker hat keinen Supabase-Key. Fehlt die Datei, bleibt die Liste leer. */
function ereignisse(): Ereignis[] {
  try {
    return leseEreignisse(readFileSync(".gedaechtnis/ereignisse.json", "utf8"));
  } catch {
    return [];
  }
}
async function main() {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: key },
    body: JSON.stringify({ query, variables: { id } }),
  });
  const json = (await res.json()) as {
    data?: { issue?: Auftrag };
    errors?: { message: string }[];
  };
  if (!res.ok || json.errors?.length || !json.data?.issue) {
    console.error(
      `Linear antwortet ${res.status}: ${json.errors?.map((e) => e.message).join("; ") ?? "kein Issue"}`,
    );
    process.exit(1);
  }
  console.log(formatiere(json.data.issue, ereignisse()));
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
