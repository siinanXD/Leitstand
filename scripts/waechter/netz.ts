/**
 * Netz-Helfer des Projekt-Wächters (SIN-419): Linear-GraphQL, GitHub-REST, Log mit Trockenlauf-Kennung.
 * Aus scripts/waechter/waechter.ts herausgelöst (SIN-915), damit das Skript unter 400 Zeilen bleibt.
 */

export const env = process.env;
export const DRY = env.DRY_RUN === "1";
/** Ein Zeitpunkt für den ganzen Lauf. */
export const jetzt = new Date();

/** Logzeile je Projekt, im Trockenlauf mit Präfix „[trocken]“. */
export const log = (projekt: string, text: string) => console.log(`${DRY ? "[trocken] " : ""}${projekt}: ${text}`);

/** Linear-GraphQL-Abfrage mit LINEAR_API_KEY; wirft bei HTTP- oder GraphQL-Fehler. */
export async function linear<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (!env.LINEAR_API_KEY) throw new Error("LINEAR_API_KEY fehlt");
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: env.LINEAR_API_KEY },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (!res.ok || json.errors) throw new Error(`Linear: ${res.status} ${JSON.stringify(json.errors ?? "")}`);
  return json.data as T;
}

/** GitHub-REST-Aufruf mit GH_TOKEN; wirft bei HTTP-Fehler. */
export async function gh<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!env.GH_TOKEN) throw new Error("GH_TOKEN fehlt (Secret AGENT_WORKFLOW_TOKEN)");
  const res = await fetch(`https://api.github.com${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

/** Status- und Label-IDs eines Linear-Teams nach Namen. */
export async function teamDaten(teamId: string) {
  const d = await linear<{ team: { states: { nodes: { id: string; name: string }[] }; labels: { nodes: { id: string; name: string }[] } } }>(
    `query($t: String!) { team(id: $t) { states { nodes { id name } } labels(first: 250) { nodes { id name } } } }`,
    { t: teamId },
  );
  const status = (name: string) => d.team.states.nodes.find((x) => x.name === name)?.id;
  const label = (name: string) => d.team.labels.nodes.find((x) => x.name.toLowerCase() === name)?.id;
  return { status, label };
}

/** Kommentar an ein Linear-Issue. */
export async function kommentar(issueId: string, body: string) {
  await linear(`mutation($id: String!, $b: String!) { commentCreate(input: { issueId: $id, body: $b }) { success } }`, { id: issueId, b: body });
}

/** Neues Linear-Issue im Projekt; fehlende Labels nur als Warnung. */
export async function neuesIssue(teamId: string, projektId: string, title: string, description: string, labels: string[], status = "Todo") {
  const t = await teamDaten(teamId);
  const labelIds = labels.map(t.label).filter((x): x is string => !!x);
  if (labelIds.length < labels.length) console.log(`::warning::Linear-Label fehlt im Team (${labels.join(", ")}).`);
  await linear(
    `mutation($i: IssueCreateInput!) { issueCreate(input: $i) { success } }`,
    { i: { teamId, projectId: projektId, title, description, labelIds, stateId: t.status(status) } },
  );
}
