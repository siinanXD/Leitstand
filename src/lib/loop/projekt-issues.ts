import type { ausLinear } from "./auswahl";

export type ProjektKnoten = Parameters<typeof ausLinear>[0] & { team: { id: string } };
type Seite = { issues: { nodes: ProjektKnoten[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } };

/** Kleine Seiten vermeiden Linears Komplexitätslimit; alle Seiten bleiben Teil derselben Planung. */
export async function ladeProjektIssues(
  linear: (query: string, variables: Record<string, unknown>) => Promise<Seite>,
  projekt: string,
): Promise<ProjektKnoten[]> {
  const nodes: ProjektKnoten[] = [];
  const gesehen = new Set<string>();
  let after: string | null = null;
  while (true) {
    const d = await linear(
      `query($p: String!, $after: String) {
        issues(first: 25, after: $after, filter: { project: { name: { eq: $p } }, state: { type: { in: ["backlog", "unstarted", "started"] } } }) {
          nodes { id identifier title description priority url createdAt startedAt team { id }
            labels { nodes { name } } state { type }
            inverseRelations { nodes { type issue { identifier state { type } } } } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { p: projekt, after },
    );
    nodes.push(...d.issues.nodes);
    if (!d.issues.pageInfo.hasNextPage) return nodes;
    after = d.issues.pageInfo.endCursor;
    if (!after || gesehen.has(after)) throw new Error("Linear: ungültiger Pagination-Cursor");
    gesehen.add(after);
  }
}
