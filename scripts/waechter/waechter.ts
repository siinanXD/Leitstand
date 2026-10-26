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
 * Optional: DRY_RUN=1 (nur planen und anzeigen), LOOP_MAX_PARALLEL (Produkte: Standard 1), LEITSTAND_MAX_PARALLEL (Standard/Maximum 2), WAECHTER_LEAD_NAME (Standard „Sinan“).
 */
import { readFile } from "node:fs/promises";
import { zaehleHaken } from "../../src/lib/ceo/fertig";
import { PROJEKTE } from "../../src/lib/projekte";
import { ausLinear, gespiegelteIds, LABEL, linearId, type GithubIssue } from "../../src/lib/loop/auswahl";
import type { Reservierung } from "../../src/lib/loop/reservierung";
import {
  entscheidungenAusKommentaren,
  entscheidungsText,
  erledigtSeit,
  gesundheit,
  istAktiv,
  leitstandSnapshot,
  istPausiert,
  kommtAlsNeuInFrage,
  pruefeNeuesProjekt,
  repoAusLinks,
  snapshotGrundOhneProjekt,
  snapshotUebersprungenGrund,
  tagesstand,
  updateFaellig,
  updateText,
  type HaengerAktion,
  type PrInfo,
  type Projekt,
  type WaechterIssue,
} from "../../src/lib/waechter/waechter";
import { DRY, env, gh, jetzt, linear, log, neuesIssue, teamDaten } from "./netz";
import { behandleHaenger, behandlePrHaenger, claimsAufraeumen, reservierungen } from "./reparatur";
import { pruefeTestnutzerRegel } from "./testnutzer";

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
            labels(first: 10) { nodes { name } } state { type name }
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
    statusName: (n.state as { name?: string }).name ?? null,
    completedAt: n.completedAt,
    kommentare: n.comments.nodes.map((c) => c.body),
  }));
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
  const prs = await gh<{ number: number; title: string; head: { ref: string; sha: string }; labels: { name: string }[]; draft: boolean; merged_at: string | null }[]>(
    `/repos/${repo}/pulls?state=open&per_page=50`,
  );
  const r: PrInfo[] = [];
  for (const p of prs) {
    if (!p.head.ref.startsWith("claude/")) continue;
    const [commit, checks, kommentare, dateien] = await Promise.all([
      gh<{ commit: { committer: { date: string } } }>(`/repos/${repo}/commits/${p.head.sha}`),
      gh<{ check_runs: { name: string; conclusion: string | null; html_url: string }[] }>(`/repos/${repo}/commits/${p.head.sha}/check-runs?per_page=50`),
      gh<{ body: string; created_at: string }[]>(`/repos/${repo}/issues/${p.number}/comments?per_page=100`),
      gh<{ filename: string }[]>(`/repos/${repo}/pulls/${p.number}/files?per_page=100`),
    ]);
    const rot = checks.check_runs.find((c) => c.name === "build" && c.conclusion === "failure");
    const bitten = kommentare.filter((c) => /@claude/.test(c.body) && /Runde \d+ von/.test(c.body)).map((c) => c.created_at);
    r.push({
      number: p.number,
      titel: p.title,
      branch: p.head.ref,
      labels: p.labels.map((l) => l.name),
      ciRot: !!rot,
      ciGruen: checks.check_runs.some((c) => c.name === "build" && c.conclusion === "success"),
      entwurf: p.draft,
      gemergtAt: p.merged_at,
      migration: dateien.some((f) => f.filename.startsWith("supabase/migrations/")),
      runUrl: rot?.html_url ?? null,
      letzterCommitAt: commit.commit.committer.date,
      letzteReparaturAt: bitten.sort().at(-1) ?? null,
    });
  }
  return r;
}

/** SIN-788: Ein übersprungener Snapshot hinterlässt einen Eintrag mit Grund, nie stilles Überspringen. */
async function meldeUebersprungen(grund: string) {
  console.log(`::warning::Kein loop_snapshot für leitstand: ${grund}`);
  if (DRY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ project: "leitstand", agent: "waechter", step: "snapshot", status: "uebersprungen", grund, issue: null, pr: null, run_id: env.GITHUB_RUN_ID ?? null, run_url: null }),
  });
  if (!res.ok) console.log(`::warning::loop_events (Snapshot übersprungen) schreiben: ${res.status}`);
}

/** Eigene Zeile `leitstand` in loop_snapshot (SIN-572): Upsert auf `project`, `plan` des Vorarbeiters bleibt. Ohne Supabase-Secrets nur Warnung. */
async function schreibeSnapshot(zeile: ReturnType<typeof leitstandSnapshot>) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("::warning::Kein loop_snapshot: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt.");
    return;
  }
  const kopf = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates",
  };
  const neu = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_snapshot?on_conflict=project`, { method: "POST", headers: kopf, body: JSON.stringify(zeile) });
  if (!neu.ok) throw new Error(`loop_snapshot schreiben: ${neu.status} ${await neu.text()}`);
}

const ghOffeneSpiegel = (repo: string) => gh<GithubIssue[]>(`/repos/${repo}/issues?labels=${LABEL}&state=open&per_page=100`);

// ------------------------------------------------------------------ Ablauf

/** SIN-762: Snapshot vor Pausen, Hängern und Reparaturen, damit ein Fehler dort ihn nicht einfriert. */
async function snapshotLeitstand(projekt: string, issues: WaechterIssue[], prs: PrInfo[], repo: string, gespiegelt: Set<string>, fehler: string[]) {
  // Linear-Link und PROJEKTE unterscheiden sich in der Schreibweise (siinanxd/leitstand vs. siinanXD/Leitstand).
  if (repo.toLowerCase() !== PROJEKTE.find((x) => x.id === "leitstand")?.repo?.toLowerCase()) return;
  const haken = await readFile("docs/FERTIG.md", "utf8").then(zaehleHaken, () => null);
  const zeile = leitstandSnapshot(issues, prs, repo, haken, gespiegelt);
  // Fehler im Feld `queue.fehler` (jsonb, keine Migration nötig).
  if (fehler.length) Object.assign(zeile.queue, { fehler });
  log(projekt, `Snapshot: ${JSON.stringify(zeile.queue)}, fertig ${haken ? `${haken.fertig} von ${haken.gesamt}` : "unbekannt"}`);
  if (!DRY) await schreibeSnapshot(zeile);
}

/** Tages-Update, wenn das letzte älter als 24 Stunden ist. */
async function tagesUpdate(projekt: Projekt, letztesUpdateAt: string | null, issues: WaechterIssue[], haenger: HaengerAktion[]) {
  if (!updateFaellig(letztesUpdateAt, jetzt)) return;
  const stand = tagesstand(issues, haenger, jetzt);
  const g = gesundheit(stand);
  log(projekt.name, `Projekt-Update (${g})`);
  if (DRY) return;
  await linear(`mutation($p: String!, $b: String!, $h: ProjectUpdateHealthType) { projectUpdateCreate(input: { projectId: $p, body: $b, health: $h }) { success } }`, {
    p: projekt.id,
    b: updateText(stand),
    h: g,
  });
}

async function aktivesProjekt(p: { projekt: Projekt; letztesUpdateAt: string | null; teamId: string }, repo: string) {
  const { projekt, teamId } = p;
  const issues = await ladeIssues(projekt.id);
  // SIN-781: Fehler beim Laden der PRs oder des GitHub-Spiegels verhindern den Snapshot nicht, er geht mit dem raus, was da ist.
  const fehler: string[] = [];
  const teil = async <T>(name: string, lade: () => Promise<T>, leer: T): Promise<T> => {
    try {
      return await lade();
    } catch (e) {
      fehler.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      console.log(`::warning::${projekt.name}: ${fehler.at(-1)}`);
      return leer;
    }
  };
  const [prs, offeneGh] = await Promise.all([teil("prs", () => ladePrs(repo), [] as PrInfo[]), teil("spiegel", () => ghOffeneSpiegel(repo), [] as GithubIssue[])]);
  const gespiegelt = gespiegelteIds(offeneGh);
  await snapshotLeitstand(projekt.name, issues, prs, repo, gespiegelt, fehler);

  // Hänger vor der Schlange, damit zurückgesetzte Issues nicht doppelt zählen.
  const haenger = await behandleHaenger(projekt.name, issues, prs, offeneGh, repo, await teamDaten(teamId), fehler.length > 0);

  // SIN-832: dauerhafte Claims und Reparaturzähler dieses Projekts; nicht lesbar = keine Reparatur, kein Aufräumen.
  const speicher = reservierungen();
  const ids = issues.map((i) => i.identifier);
  // Alle Issues mit offenem PR und alle mit Claim: der Zähler gilt auch ohne aktiven Claim (Befund 4).
  const mitPr = prs.map((p) => linearId(p.titel)).filter((x): x is string => !!x);
  const stand = speicher ? await teil("reservierung", () => speicher.staende([...ids, ...mitPr]), [] as Reservierung[]) : [];
  const lesbar = !!speicher && !fehler.some((f) => f.startsWith("reservierung:"));
  await behandlePrHaenger(projekt.name, repo, prs, new Map(stand.map((r) => [r.issue, r.reparaturen])), speicher, lesbar);

  if (!fehler.length) await claimsAufraeumen(projekt.name, repo, ids, prs, gespiegelt, stand);
  await pruefeTestnutzerRegel(projekt, teamId, repo).catch((e: Error) => console.log(`::warning::${projekt.name}: Testnutzer-Regel: ${e.message}`));

  // SIN-941: Die Schlange füllt nur der Planer (Nachrücken, Planungs-Issues).
  await tagesUpdate(projekt, p.letztesUpdateAt, issues, haenger);
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

/** SIN-651: „Entscheidung:“-Kommentare in Linear → Label `entschieden` und Antwort als PR-Kommentar. Einmal je PR (Label verhindert Wiederholung). */
async function uebernehmeEntscheidungen() {
  const d = await linear<{ comments: { nodes: { body: string }[] } }>(
    `query { comments(first: 100, orderBy: createdAt, filter: { body: { startsWith: "Entscheidung:" } }) { nodes { body } } }`,
  );
  for (const e of entscheidungenAusKommentaren(d.comments.nodes.map((c) => c.body))) {
    const pr = await gh<{ labels: { name: string }[] }>(`/repos/${e.repo}/issues/${e.nummer}`);
    if (pr.labels.some((l) => l.name === "entschieden")) continue;
    log(e.repo, `PR #${e.nummer}: Entscheidung aus Linear → Label entschieden`);
    if (DRY) continue;
    await gh(`/repos/${e.repo}/issues/${e.nummer}/labels`, { method: "POST", body: { labels: ["entschieden"] } });
    await gh(`/repos/${e.repo}/issues/${e.nummer}/comments`, { method: "POST", body: { body: entscheidungsText(e) } });
  }
}

async function main() {
  const alle = await ladeProjekte();
  let fehler = 0;
  try {
    await uebernehmeEntscheidungen();
  } catch (e) {
    fehler++;
    console.log(`::error::Entscheidungen: ${(e as Error).message}`);
  }
  const leitstand = PROJEKTE.find((x) => x.id === "leitstand");
  const fehlt = leitstand?.linearProjekt ? snapshotGrundOhneProjekt(alle.map((p) => p.projekt.name), { linearProjekt: leitstand.linearProjekt }) : null;
  if (fehlt) await meldeUebersprungen(fehlt);
  for (const p of alle) {
    const name = p.projekt.name;
    try {
      const repo = repoAusLinks(p.projekt.links);
      const ziel = PROJEKTE.find((x) => x.id === "leitstand");
      const grund = ziel?.repo && ziel.linearProjekt ? snapshotUebersprungenGrund(p.projekt, repo, { repo: ziel.repo, linearProjekt: ziel.linearProjekt }) : null;
      if (grund) await meldeUebersprungen(grund);
      if (istPausiert(p.projekt)) {
        log(name, "pausiert, unberührt");
        continue;
      }
      await neuesProjekt(p);
      if (!istAktiv(p.projekt)) continue;
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
