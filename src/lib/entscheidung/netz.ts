// Linear-GraphQL für den Entscheidungs-Eingang (SIN-1012). Läuft nur serverseitig mit `LINEAR_API_KEY`.
import { LABEL_ENTSCHEIDUNG, type EntscheidungsNetz } from "./entscheidung";

const LINEAR = "https://api.linear.app/graphql";
const ENTFERNEN = [LABEL_ENTSCHEIDUNG, "needs-human"];
const HINZU = ["claude", "gedaechtnis"];
const gleich = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

type Label = { id: string; name: string };
type IssueDaten = { id: string; description: string | null; team: { labels: { nodes: Label[] }; states: { nodes: Label[] } }; labels: { nodes: Label[] } };

export function entscheidungsNetz(apiKey: string, hole: typeof fetch = fetch): EntscheidungsNetz {
  const rufe = async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
    const res = await hole(LINEAR, { method: "POST", headers: { "Content-Type": "application/json", Authorization: apiKey }, body: JSON.stringify({ query, variables }) });
    const json = (await res.json()) as { data?: T; errors?: unknown };
    if (!res.ok || json.errors || !json.data) throw new Error(`Linear: ${res.status}`);
    return json.data;
  };
  const issue = async (kennung: string) =>
    (
      await rufe<{ issue: IssueDaten | null }>(
        `query($k: String!) { issue(id: $k) { id description team { labels(first: 250) { nodes { id name } } states { nodes { id name } } } labels { nodes { id name } } } }`,
        { k: kennung },
      )
    ).issue;
  return {
    async offene() {
      const d = await rufe<{ issues: { nodes: { identifier: string; title: string; url: string; description: string | null }[] } }>(
        `query($l: String!) { issues(first: 100, filter: { labels: { name: { eqIgnoreCase: $l } }, state: { type: { nin: ["completed", "canceled"] } } }) { nodes { identifier title url description } } }`,
        { l: LABEL_ENTSCHEIDUNG },
      );
      return d.issues.nodes;
    },
    async beschreibung(kennung) {
      return (await issue(kennung))?.description ?? null;
    },
    async beantworten(kennung, kommentar) {
      const i = await issue(kennung);
      if (!i) throw new Error("Linear: Issue unbekannt");
      const neu = HINZU.map((n) => i.team.labels.nodes.find((l) => gleich(l.name, n))?.id);
      const todo = i.team.states.nodes.find((s) => gleich(s.name, "Todo"))?.id;
      if (neu.some((x) => !x) || !todo) throw new Error("Linear: Label oder Status fehlt");
      const behalten = i.labels.nodes.filter((l) => !ENTFERNEN.some((n) => gleich(n, l.name))).map((l) => l.id);
      // Erst der Kommentar: schlägt das Umstellen fehl, geht die Antwort nicht verloren.
      await rufe(`mutation($i: String!, $b: String!) { commentCreate(input: { issueId: $i, body: $b }) { success } }`, { i: i.id, b: kommentar });
      await rufe(`mutation($i: String!, $l: [String!]!, $s: String!) { issueUpdate(id: $i, input: { labelIds: $l, stateId: $s }) { success } }`, { i: i.id, l: [...new Set([...behalten, ...(neu as string[])])], s: todo });
    },
  };
}
