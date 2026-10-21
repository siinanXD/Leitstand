// SIN-945: reine Formatierung des Linear-Auftrags für den Worker (Skript: scripts/loop/auftrag.ts).
export type Auftrag = {
  identifier: string; title: string; url: string; description: string | null; state: { name: string };
  labels: { nodes: { name: string }[] };
  inverseRelations: { nodes: { type: string; issue: { identifier: string; state: { name: string } } }[] };
  comments: { nodes: { createdAt: string; body: string }[] };
};

export function formatiere(i: Auftrag): string {
  const blocker = i.inverseRelations.nodes.filter((r) => r.type === "blocks").map((r) => `${r.issue.identifier} (${r.issue.state.name})`);
  return [
    `# ${i.identifier}: ${i.title}`,
    `Status: ${i.state.name} · Labels: ${i.labels.nodes.map((l) => l.name).join(", ") || "keine"} · Blocker: ${blocker.join(", ") || "keine"}`,
    i.url,
    "",
    (i.description ?? "(keine Beschreibung)").replace(/\\([\[\]])/g, "$1"),
    "",
    `## Kommentare (${i.comments.nodes.length})`,
    ...i.comments.nodes.map((c) => `- ${c.createdAt.slice(0, 16).replace("T", " ")}: ${c.body.replace(/\n+/g, " ")}`),
  ].join("\n");
}
