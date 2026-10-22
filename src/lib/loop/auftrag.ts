// SIN-945: reine Formatierung des Linear-Auftrags für den Worker (Skript: scripts/loop/auftrag.ts).
export type Auftrag = {
  identifier: string; title: string; url: string; description: string | null; state: { name: string };
  labels: { nodes: { name: string }[] };
  inverseRelations: { nodes: { type: string; issue: { identifier: string; state: { name: string } } }[] };
  comments: { nodes: { createdAt: string; body: string }[] };
};

export type Ereignis = { created_at: string; step: string; status: string; grund?: string | null };

/** Lesekopie der loop_events (JSON-Array aus PostgREST); alles andere ergibt eine leere Liste. */
export function leseEreignisse(text: string): Ereignis[] {
  try {
    const daten: unknown = JSON.parse(text);
    if (!Array.isArray(daten)) return [];
    return daten.filter((e): e is Ereignis => !!e && typeof e.created_at === "string" && typeof e.step === "string" && typeof e.status === "string");
  } catch {
    return [];
  }
}

const ANZAHL_KOMMENTARE = 5;
const ANZAHL_EREIGNISSE = 10;
const istPause = (body: string) => /^\s*(⏸\s*)?pause\b/i.test(body);
const zeit = (iso: string) => iso.slice(0, 16).replace("T", " ");

/** SIN-891: Die letzten 5 Kommentare ohne Pausen-Kommentare, neueste zuerst. Sie gehen Haken und Beschreibung vor. */
export const neuesteKommentare = (kommentare: Auftrag["comments"]["nodes"]) =>
  kommentare.filter((c) => !istPause(c.body)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, ANZAHL_KOMMENTARE);

export function formatiere(i: Auftrag, ereignisse: Ereignis[] = []): string {
  const blocker = i.inverseRelations.nodes.filter((r) => r.type === "blocks").map((r) => `${r.issue.identifier} (${r.issue.state.name})`);
  const neueste = neuesteKommentare(i.comments.nodes);
  return [
    `# ${i.identifier}: ${i.title}`,
    `Status: ${i.state.name} · Labels: ${i.labels.nodes.map((l) => l.name).join(", ") || "keine"} · Blocker: ${blocker.join(", ") || "keine"}`,
    i.url,
    "",
    `## Neueste Kommentare (${neueste.length}, neueste zuerst; sie gehen Beschreibung und Haken vor)`,
    ...neueste.map((c) => `- ${zeit(c.createdAt)}: ${c.body.replace(/\n+/g, " ")}`),
    ...(ereignisse.length
      ? ["", `## Letzte Ereignisse in loop_events (${Math.min(ereignisse.length, ANZAHL_EREIGNISSE)})`,
          ...ereignisse.slice(0, ANZAHL_EREIGNISSE).map((e) => `- ${zeit(e.created_at)} ${e.step} ${e.status}${e.grund ? `: ${e.grund}` : ""}`)]
      : []),
    "",
    (i.description ?? "(keine Beschreibung)").replace(/\\([\[\]])/g, "$1"),
  ].join("\n");
}
