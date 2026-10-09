/**
 * Projekt-Wächter (SIN-419). Aufruf aus waechter.yml:
 *
 *   npx tsx scripts/waechter/waechter.ts
 *
 * Je Linear-Projekt im Status „In Progress“ mit GitHub-Link: Schlange füllen, Hänger reparieren, Tages-Update.
 * Neue Projekte (jünger als 7 Tage): Lead, Priorität, Zusammenfassung ergänzen, bei fehlendem Link „Projekt einrichten“.
 * Nie Issues löschen, nie Projekte abbrechen. Pausierte Projekte bleiben unberührt.
 *
 * Env: LINEAR_API_KEY, GH_TOKEN (AGENT_WORKFLOW_TOKEN mit Lese- und Kommentarrechten auf alle aktiven Repos).
 * Optional: DRY_RUN=1 (nur planen und anzeigen), LOOP_MAX_PARALLEL (Standard 1), WAECHTER_LEAD_NAME (Standard „Sinan“).
 */
import { ausLinear, gespiegelteIds, LABEL, type GithubIssue } from "../../src/lib/loop/auswahl";
import {
  erkenneIssueHaenger,
  erkennePrHaenger,
  erledigtSeit,
  gesundheit,
  istAktiv,
  istPausiert,
  kommtAlsNeuInFrage,
  MARKER_ZURUECK,
  planeSchlange,
  planungsIssue,
  pruefeNeuesProjekt,
  repoAusLinks,
  reparaturText,
  tagesstand,
  updateFaellig,
  updateText,
  type PrInfo,
  type Projekt,
  type WaechterIssue,
} from "../../src/lib/waechter/waechter";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const jetzt = new Date();
const max = Number(env.LOOP_MAX_PARALLEL ?? 1);

const log = (projekt: string, text: string) => console.log(`${DRY ? "[trocken] " : ""}${projekt}: ${text}`);

async function linear<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
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

async function gh<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!env.GH_TOKEN) throw new Error("GH_TOKEN fehlt (Secret AGENT_WORKFLOW_TOKEN)");
  const res = await fetch(`https://api.github.com${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

// ------------------------------------------------------------------ Linear

type ProjektNode = {
  id: string;
  name: string;
  description: string | null;
  content: string | null;
  priority: number;
  createdAt: string;
  status: { type: string };
  lead: { id: string } | null;
  externalLinks: { nodes: { label: string; url: string }[] };
  projectUpdates: { nodes: { createdAt: string }[] };
  teams: { nodes: { id: string }[] };
};

async function ladeProjekte(): Promise<{ projekt: Projekt; letztesUpdateAt: string | null; teamId: string }[]> {
  const d = await linear<{ projects: { nodes: ProjektNode[] } }>(`query {
    projects(first: 50) {
      nodes { id name description content priority createdAt status { type } lead { id }
        externalLinks(first: 10) { nodes { label url } }
        projectUpdates(first: 1) { nodes { createdAt } }
        teams(first: 1) { nodes { id } } }
    }
  }`);
  return d.projects.nodes.map((n) => ({
    projekt: {
      id: n.id,
      name: n.name,
      statusTyp: n.status.type,
      zusammenfassung: n.description,
      beschreibung: n.content,
      leadId: n.lead?.id ?? null,
      prioritaet: n.priority,
      createdAt: n.createdAt,
      links: n.externalLinks.nodes,
    },
    letztesUpdateAt: n.projectUpdates.nodes[0]?.createdAt ?? null,
    teamId: n.teams.nodes[0]?.id ?? "",
  }));
}

type IssueNode = Parameters<typeof ausLinear>[0] & {
  startedAt: string | null;
  completedAt: string | null;
  comments: { nodes: { body: string }[] };
};

// Linear erlaubt höchstens 10 000 Punkte Komplexität je Abfrage (first × Felder). Deshalb nur offene Issues und die
// der letzten 48 h, mit kleinen Unterlisten. Vorher 25 831 Punkte → „Query too complex“ in jedem Projekt.
async function ladeIssues(projektId: string): Promise<WaechterIssue[]> {
  const d = await linear<{ project: { issues: { nodes: IssueNode[] } } }>(
    `query($p: String!) {
      project(id: $p) {
        issues(first: 100, filter: { or: [{ state: { type: { nin: ["completed", "canceled"] } } }, { completedAt: { gt: "${erledigtSeit(jetzt)}" } }] }) {
          nodes { id identifier title description priority url createdAt startedAt completedAt
            labels(first: 10) { nodes { name } } state { type }
            inverseRelations(first: 10) { nodes { type issue { identifier state { type } } } }
            comments(first: 20) { nodes { body } } }
        }
      }
    }`,
    { p: projektId },
  );
  return d.project.issues.nodes.map((n) => ({
    ...ausLinear(n),
    startedAt: n.startedAt,
    completedAt: n.completedAt,
    kommentare: n.comments.nodes.map((c) => c.body),
  }));
}

async function teamDaten(teamId: string) {
  const d = await linear<{ team: { states: { nodes: { id: string; name: string }[] }; labels: { nodes: { id: string; name: string }[] } } }>(
    `query($t: String!) { team(id: $t) { states { nodes { id name } } labels(first: 250) { nodes { id name } } } }`,
    { t: teamId },
  );
  const status = (name: string) => d.team.states.nodes.find((x) => x.name === name)?.id;
  const label = (name: string) => d.team.labels.nodes.find((x) => x.name.toLowerCase() === name)?.id;
  return { status, label };
}

async function kommentar(issueId: string, body: string) {
  await linear(`mutation($id: String!, $b: String!) { commentCreate(input: { issueId: $id, body: $b }) { success } }`, { id: issueId, b: body });
}

async function neuesIssue(teamId: string, projektId: string, title: string, description: string, labels: string[], status = "Todo") {
  const t = await teamDaten(teamId);
  const labelIds = labels.map(t.label).filter((x): x is string => !!x);
  if (labelIds.length < labels.length) console.log(`::warning::Linear-Label fehlt im Team (${labels.join(", ")}).`);
  await linear(
    `mutation($i: IssueCreateInput!) { issueCreate(input: $i) { success } }`,
    { i: { teamId, projectId: projektId, title, description, labelIds, stateId: t.status(status) } },
  );
}

let leadId: string | null | undefined;
async function sinanId(): Promise<string | null> {
  if (leadId !== undefined) return leadId;
  const d = await linear<{ users: { nodes: { id: string }[] } }>(
    `query($n: String!) { users(filter: { name: { containsIgnoreCase: $n } }) { nodes { id } } }`,
    { n: env.WAECHTER_LEAD_NAME ?? "Sinan" },
  );
  leadId = d.users.nodes[0]?.id ?? null;
  return leadId;
}

// ------------------------------------------------------------------ GitHub

async function ladePrs(repo: string): Promise<PrInfo[]> {
  const prs = await gh<{ number: number; title: string; head: { ref: string; sha: string }; labels: { name: string }[]; draft: boolean }[]>(
    `/repos/${repo}/pulls?state=open&per_page=50`,
  );
  const r: PrInfo[] = [];
  for (const p of prs) {
    if (!p.head.ref.startsWith("claude/")) continue;
    const [commit, checks, kommentare] = await Promise.all([
      gh<{ commit: { committer: { date: string } } }>(`/repos/${repo}/commits/${p.head.sha}`),
      gh<{ check_runs: { name: string; conclusion: string | null; html_url: string }[] }>(`/repos/${repo}/commits/${p.head.sha}/check-runs?per_page=50`),
      gh<{ body: string; created_at: string }[]>(`/repos/${repo}/issues/${p.number}/comments?per_page=100`),
    ]);
    const rot = checks.check_runs.find((c) => c.name === "build" && c.conclusion === "failure");
    const bitten = kommentare.filter((c) => /@claude/.test(c.body) && /Runde \d+ von/.test(c.body)).map((c) => c.created_at);
    r.push({
      number: p.number,
      titel: p.title,
      branch: p.head.ref,
      labels: p.labels.map((l) => l.name),
      ciRot: !!rot,
      runUrl: rot?.html_url ?? null,
      letzterCommitAt: commit.commit.committer.date,
      letzteReparaturAt: bitten.sort().at(-1) ?? null,
    });
  }
  return r;
}

async function ghIssuesGespiegelt(repo: string): Promise<Set<string>> {
  const l = await gh<GithubIssue[]>(`/repos/${repo}/issues?labels=${LABEL}&state=all&per_page=100`);
  return gespiegelteIds(l);
}

// ------------------------------------------------------------------ Ablauf

async function aktivesProjekt(p: { projekt: Projekt; letztesUpdateAt: string | null; teamId: string }, repo: string) {
  const { projekt, teamId } = p;
  const issues = await ladeIssues(projekt.id);
  const [prs, gespiegelt] = await Promise.all([ladePrs(repo), ghIssuesGespiegelt(repo)]);
  const team = await teamDaten(teamId);

  // Hänger vor der Schlange, damit zurückgesetzte Issues nicht doppelt zählen.
  const haenger = erkenneIssueHaenger(issues, prs, jetzt);
  for (const h of haenger) {
    if (h.art === "zuruecksetzen") {
      log(projekt.name, `${h.issue.identifier} hängt seit über 6 h ohne PR → zurück auf Todo`);
      if (DRY) continue;
      const todo = team.status("Todo");
      if (todo) await linear(`mutation($id: String!, $s: String!) { issueUpdate(id: $id, input: { stateId: $s }) { success } }`, { id: h.issue.id, s: todo });
      await kommentar(h.issue.id, `Wächter: seit über 6 Stunden In Progress ohne offenen PR. Zurück auf Todo (einmalig). ${MARKER_ZURUECK}`);
    } else {
      log(projekt.name, `${h.issue.identifier} hängt erneut → needs-human`);
      if (DRY) continue;
      const l = team.label("needs-human");
      if (l) await linear(`mutation($id: String!, $l: [String!]) { issueUpdate(id: $id, input: { addedLabelIds: $l }) { success } }`, { id: h.issue.id, l: [l] });
      await kommentar(h.issue.id, "Wächter: hängt zum zweiten Mal ohne PR. Sinan entscheidet (needs-human).");
    }
  }

  for (const a of erkennePrHaenger(prs, jetzt)) {
    if (a.art === "reparatur") {
      log(projekt.name, `PR #${a.pr.number} rot ohne Commit → @claude, Runde ${a.runde}`);
      if (DRY) continue;
      await gh(`/repos/${repo}/issues/${a.pr.number}/labels`, { method: "POST", body: { labels: [`repair:${a.runde}`] } });
      await gh(`/repos/${repo}/issues/${a.pr.number}/comments`, { method: "POST", body: { body: reparaturText(a.pr, a.runde) } });
    } else {
      log(projekt.name, `PR #${a.pr.number} nach 3 Runden noch rot → needs-human`);
      if (DRY) continue;
      await gh(`/repos/${repo}/issues/${a.pr.number}/labels`, { method: "POST", body: { labels: ["needs-human"] } });
      await gh(`/repos/${repo}/issues/${a.pr.number}/comments`, {
        method: "POST",
        body: { body: `Wächter: build ist nach 3 Reparaturrunden noch rot${a.pr.runUrl ? ` (${a.pr.runUrl})` : ""}. Stopp, Sinan entscheidet.` },
      });
    }
  }

  const zurueckgesetzt = new Set(haenger.filter((h) => h.art === "zuruecksetzen").map((h) => h.issue.identifier));
  const aktion = planeSchlange(
    issues.map((i) => (zurueckgesetzt.has(i.identifier) ? { ...i, stateType: "unstarted" } : i)),
    gespiegelt,
    max,
  );
  if (aktion?.art === "nachruecken") {
    log(projekt.name, `rückt nach: ${aktion.issue.identifier} ${aktion.issue.title}`);
    if (!DRY) {
      const todo = team.status("Todo");
      const label = team.label(LABEL);
      if (!todo || !label) throw new Error("Status „Todo“ oder Label „claude“ in Linear nicht gefunden");
      await linear(`mutation($id: String!, $s: String!, $l: [String!]) { issueUpdate(id: $id, input: { stateId: $s, addedLabelIds: $l }) { success } }`, {
        id: aktion.issue.id,
        s: todo,
        l: [label],
      });
      await kommentar(aktion.issue.id, "Wächter: Schlange war leer, aus dem Backlog nachgerückt (SIN-419, Regel SIN-417).");
    }
  } else if (aktion?.art === "planung") {
    const t = planungsIssue(projekt.name);
    log(projekt.name, `Schlange und Backlog leer → Planungs-Issue „${t.title}“`);
    if (!DRY) await neuesIssue(teamId, projekt.id, t.title, t.description, [LABEL]);
  } else {
    log(projekt.name, "Schlange ok");
  }

  if (updateFaellig(p.letztesUpdateAt, jetzt)) {
    const stand = tagesstand(issues, haenger, jetzt);
    const g = gesundheit(stand);
    log(projekt.name, `Projekt-Update (${g})`);
    if (!DRY) {
      await linear(`mutation($p: String!, $b: String!, $h: ProjectUpdateHealthType) { projectUpdateCreate(input: { projectId: $p, body: $b, health: $h }) { success } }`, {
        p: projekt.id,
        b: updateText(stand),
        h: g,
      });
    }
  }
}

async function neuesProjekt(p: { projekt: Projekt; teamId: string }) {
  const { projekt, teamId } = p;
  if (!kommtAlsNeuInFrage(projekt, jetzt)) return;
  const issues = await ladeIssues(projekt.id);
  const r = pruefeNeuesProjekt(projekt, issues, jetzt);
  if (!r) return;
  const a = r.aenderung;
  if (Object.keys(a).length) {
    log(projekt.name, `ergänzt: ${Object.keys(a).join(", ")}`);
    if (!DRY) {
      const input: Record<string, unknown> = {};
      if (a.zusammenfassung) input.description = a.zusammenfassung;
      if (a.prioritaet) input.priority = a.prioritaet;
      if (a.leadSinan) {
        const id = await sinanId();
        if (id) input.leadId = id;
        else console.log("::warning::Benutzer für Lead nicht gefunden (WAECHTER_LEAD_NAME).");
      }
      if (Object.keys(input).length) await linear(`mutation($id: String!, $i: ProjectUpdateInput!) { projectUpdate(id: $id, input: $i) { success } }`, { id: projekt.id, i: input });
    }
  }
  if (r.einrichten) {
    log(projekt.name, `kein GitHub-Link → Issue „${r.einrichten.titel}“ und ${r.einrichten.sinanAufgaben.length} sinan-Aufgaben`);
    if (!DRY) {
      await neuesIssue(teamId, projekt.id, r.einrichten.titel, r.einrichten.beschreibung, [LABEL]);
      for (const s of r.einrichten.sinanAufgaben) await neuesIssue(teamId, projekt.id, s.titel, s.beschreibung, ["sinan"], "Backlog");
    }
  }
}

async function main() {
  const alle = await ladeProjekte();
  let fehler = 0;
  for (const p of alle) {
    const name = p.projekt.name;
    try {
      if (istPausiert(p.projekt)) {
        log(name, "pausiert, unberührt");
        continue;
      }
      await neuesProjekt(p);
      if (!istAktiv(p.projekt)) continue;
      const repo = repoAusLinks(p.projekt.links);
      if (!repo) {
        log(name, "aktiv, aber kein GitHub-Link: übersprungen");
        continue;
      }
      await aktivesProjekt(p, repo);
    } catch (e) {
      fehler++;
      console.log(`::error::${name}: ${(e as Error).message}`);
    }
  }
  if (fehler) process.exit(1);
}

main().catch((e: Error) => {
  console.error(`::error::${e.message}`);
  process.exit(1);
});
