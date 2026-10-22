/**
 * Auftrag aus Linear lesen (SIN-945): Der Worker darf keine Shell-Befehle mit $LINEAR_API_KEY ausführen,
 * deshalb liest dieses Skript das Issue selbst. Aufruf: npx tsx scripts/loop/auftrag.ts SIN-123
 * Ausgabe: Titel, Status, Labels, Blocker, die 5 neuesten Kommentare (ohne Pause) vor der Beschreibung, optional die letzten 10 loop_events. Nur lesend.
 */
import { formatiere, type Auftrag, type Ereignis } from "../../src/lib/loop/auftrag";

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
/** Letzte 10 loop_events zum Issue (SIN-891). Ohne SUPABASE_*-Variablen oder bei Lesefehler leer: der Auftrag bleibt lesbar. */
async function ereignisse(): Promise<Ereignis[]> {
  const url = process.env.SUPABASE_URL;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !sk) return [];
  try {
    const q = `select=created_at,step,status,grund&grund=ilike.*${id}*&order=created_at.desc&limit=10`;
    const res = await fetch(`${url}/rest/v1/loop_events?${q}`, { headers: { apikey: sk, Authorization: `Bearer ${sk}` } });
    return res.ok ? ((await res.json()) as Ereignis[]) : [];
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
  console.log(formatiere(json.data.issue, await ereignisse()));
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
