// Neue Idee aus der Kopfzeile (SIN-530). Läuft nur serverseitig; das Linear-Netz kommt als `LinearNetz` herein, damit die Logik testbar bleibt.
import { PROJEKTE } from "./projekte";

export const MAX_ZEICHEN = 280;
export const LABEL_IDEE = "idee";
export const LABEL_DRINGEND = "dringend";
export const MEILENSTEIN_IDEE = "v2 Ideen";
export const MEILENSTEIN_DRINGEND = "v1";
export const STATUS_DRINGEND = "Todo";

export type IdeeEingabe = { projekt: string; text: string; dringend: boolean };

/** Prüft den Body; null bei unbekanntem Projekt, leerem oder zu langem Satz. */
export function ideeEingabe(body: unknown): IdeeEingabe | null {
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const text = typeof o.text === "string" ? o.text.trim().replace(/\s+/g, " ") : "";
  if (typeof o.projekt !== "string" || !PROJEKTE.some((p) => p.id === o.projekt)) return null;
  if (text === "" || text.length > MAX_ZEICHEN) return null;
  if (o.dringend !== undefined && typeof o.dringend !== "boolean") return null;
  return { projekt: o.projekt, text, dringend: o.dringend === true };
}

export type LinearProjekt = { id: string; teamId: string; meilensteine: { id: string; name: string }[] };
export type NeuesIssue = { teamId: string; projectId: string; milestoneId: string; title: string; labelIds: string[]; stateId?: string };

/** Die Linear-Aufrufe, die die Idee braucht. Jeder wirft bei Fehlern. */
export type LinearNetz = {
  projekt(name: string): Promise<LinearProjekt | null>;
  labels(teamId: string): Promise<{ id: string; name: string }[]>;
  status(teamId: string): Promise<{ id: string; name: string }[]>;
  anlegen(issue: NeuesIssue): Promise<{ identifier: string; url: string }>;
};

export type IdeeErgebnis = { ok: true; kennung: string; url: string; dringend: boolean } | { ok: false; grund: "projekt" | "meilenstein" | "label" | "status" | "linear" };

const gleich = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Legt das Linear-Issue an: Label `idee` (+ `dringend`), Meilenstein „v2 Ideen“, bei dringend Meilenstein „v1“ und Status Todo. */
export async function ideeAnlegen(netz: LinearNetz, eingabe: IdeeEingabe): Promise<IdeeErgebnis> {
  try {
    const projekt = PROJEKTE.find((p) => p.id === eingabe.projekt);
    const ziel = projekt ? await netz.projekt(projekt.name) : null;
    if (!ziel) return { ok: false, grund: "projekt" };
    const meilenstein = ziel.meilensteine.find((m) => gleich(m.name, eingabe.dringend ? MEILENSTEIN_DRINGEND : MEILENSTEIN_IDEE));
    if (!meilenstein) return { ok: false, grund: "meilenstein" };
    const labels = await netz.labels(ziel.teamId);
    const namen = eingabe.dringend ? [LABEL_IDEE, LABEL_DRINGEND] : [LABEL_IDEE];
    const labelIds = namen.map((n) => labels.find((l) => gleich(l.name, n))?.id);
    if (labelIds.some((id) => !id)) return { ok: false, grund: "label" };
    let stateId: string | undefined;
    if (eingabe.dringend) {
      stateId = (await netz.status(ziel.teamId)).find((s) => gleich(s.name, STATUS_DRINGEND))?.id;
      if (!stateId) return { ok: false, grund: "status" };
    }
    const issue = await netz.anlegen({ teamId: ziel.teamId, projectId: ziel.id, milestoneId: meilenstein.id, title: eingabe.text, labelIds: labelIds as string[], stateId });
    return { ok: true, kennung: issue.identifier, url: issue.url, dringend: eingabe.dringend };
  } catch {
    return { ok: false, grund: "linear" };
  }
}

export const bestaetigung = (dringend: boolean) => (dringend ? "Kommt sofort dran" : "Kommt nach und nach dran");

/** Zeile für `loop_events`; Schlüssel wie in `scripts/loop/loop.ts`. */
export function ideeZeile(projekt: string, ergebnis: IdeeErgebnis) {
  return { project: projekt, step: "idee", status: ergebnis.ok ? (ergebnis.dringend ? "dringend" : "ok") : "fehler", issue: ergebnis.ok ? ergebnis.kennung : null, pr: null };
}

const LINEAR = "https://api.linear.app/graphql";

/** Linear-GraphQL mit eigenem Schlüssel (`LINEAR_API_KEY`), nie im Browser. */
export function linearNetz(apiKey: string, hole: typeof fetch = fetch): LinearNetz {
  const rufe = async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
    const res = await hole(LINEAR, { method: "POST", headers: { "Content-Type": "application/json", Authorization: apiKey }, body: JSON.stringify({ query, variables }) });
    const json = (await res.json()) as { data?: T; errors?: unknown };
    if (!res.ok || json.errors || !json.data) throw new Error(`Linear: ${res.status}`);
    return json.data;
  };
  return {
    async projekt(name) {
      const d = await rufe<{ projects: { nodes: { id: string; teams: { nodes: { id: string }[] }; projectMilestones: { nodes: { id: string; name: string }[] } }[] } }>(
        `query($n: String!) { projects(first: 5, filter: { name: { eqIgnoreCase: $n } }) { nodes { id teams { nodes { id } } projectMilestones { nodes { id name } } } } }`,
        { n: name },
      );
      const p = d.projects.nodes[0];
      const team = p?.teams.nodes[0];
      return p && team ? { id: p.id, teamId: team.id, meilensteine: p.projectMilestones.nodes } : null;
    },
    async labels(teamId) {
      const d = await rufe<{ team: { labels: { nodes: { id: string; name: string }[] } } }>(`query($t: String!) { team(id: $t) { labels(first: 250) { nodes { id name } } } }`, { t: teamId });
      return d.team.labels.nodes;
    },
    async status(teamId) {
      const d = await rufe<{ team: { states: { nodes: { id: string; name: string }[] } } }>(`query($t: String!) { team(id: $t) { states { nodes { id name } } } }`, { t: teamId });
      return d.team.states.nodes;
    },
    async anlegen(issue) {
      const d = await rufe<{ issueCreate: { success: boolean; issue: { identifier: string; url: string } | null } }>(
        `mutation($i: IssueCreateInput!) { issueCreate(input: $i) { success issue { identifier url } } }`,
        { i: { teamId: issue.teamId, projectId: issue.projectId, projectMilestoneId: issue.milestoneId, title: issue.title, labelIds: issue.labelIds, ...(issue.stateId ? { stateId: issue.stateId } : {}) } },
      );
      if (!d.issueCreate.success || !d.issueCreate.issue) throw new Error("Linear: Issue nicht angelegt");
      return d.issueCreate.issue;
    },
  };
}
