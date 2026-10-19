import { ladeProjektIssues, type ProjektKnoten } from "../../src/lib/loop/projekt-issues";
/**
 * Loop des Leitstands (SIN-413). Aufruf aus den Workflows:
 *
 *   npx tsx scripts/loop/loop.ts dispatch            Todo-Issues aus Linear als GitHub-Issue mit Label `claude` starten;
 *                                                    ist keins da, rückt das wichtigste Backlog-Issue nach (SIN-417)
 *   npx tsx scripts/loop/loop.ts gemergt --pr 12     Linear-Issue zum gemergten PR auf Done setzen
 *   npx tsx scripts/loop/loop.ts reparatur --pr 12 --lauf <url>   nach rotem `build`: @claude bitten oder stoppen
 *
 * Dispatch läuft je Produkt aus projekte.ts (repo + linearProjekt + bauphase, SIN-763); LOOP_MAX_PARALLEL gilt je Repo.
 *
 * Env: LINEAR_API_KEY, GH_TOKEN (AGENT_WORKFLOW_TOKEN, damit Folge-Workflows starten), GITHUB_REPOSITORY.
 * Optional: LOOP_MAX_PARALLEL (Standard 1), DRY_RUN=1, SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY für loop_events.
 * Ohne Supabase-Secrets steht nur eine Warnung im Log (nie ein Abbruch).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { LEHREN_ORDNER, leseLehre, workerHinweise } from "../../src/lib/lernen/lernen";
import { aktivePause, pauseSatz } from "../../src/lib/kontingent/kontingent";
import { PAUSE_SCHRITT, pauseStand, type PauseStand } from "../../src/lib/pause";
import { ladeClaudeRest, ladeOffenePausen } from "../kontingent/pausen";
import { knappSatz } from "../../src/lib/kontingent/prioritaet";
import { haelt, SCHRITT as VERSION_SCHRITT, staende } from "../../src/lib/visionaer/visionaer";
import { fehlergrund } from "../../src/lib/loop/fehlergrund";
import { ausLinear, freigegebene, gemergteFuerLaufende, PLATZ_MINUTEN, gespiegelteIds, grundNichtsStartbar, issueText, LABEL, linearId, nachruecken, offeneSpiegel, reparatur, teilGemergte, waehle, type Belegung, type GithubIssue, type LinearIssue } from "../../src/lib/loop/auswahl";
import { entscheide, istTeil, kommentarText, leseBelege, leseHaken, RUNDE_MARKER, setzeHaken, wiederaufnahme } from "../../src/lib/loop/haken";
import { loopZiele, type LoopZiel } from "../../src/lib/projekte";
import { planeFallback, reserviere, type Ereignis, type ProviderStand } from "../../src/lib/loop/fallback";
import { auftragAus, supabaseReservierung, type ReservierungsSpeicher } from "../../src/lib/loop/reservierung";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const repo = env.GITHUB_REPOSITORY ?? "siinanXD/leitstand";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

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
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

/** Ein Ereignis in loop_events (SIN-303). Fehler werden nur gemeldet. */
type Extra = { issue?: string; pr?: number; grund?: string; projekt?: string };
/** `uebersprungen` und `fehler` brauchen immer einen Grund (SIN-654, SIN-617), sonst ist im Leitstand nicht erkennbar, warum nichts lief. */
async function ereignis(step: string, status: "uebersprungen" | "fehler", extra: Extra & { grund: string }): Promise<void>;
async function ereignis(step: string, status: "start" | "ok", extra?: Extra): Promise<void>;
async function ereignis(step: string, status: "start" | "ok" | "fehler" | "uebersprungen", extra: Extra = {}) {
  if (extra.grund) console.log(`${step}/${status}: ${extra.grund}`);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`::warning::Kein loop_event (${step}/${status}): SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt.`);
    return;
  }
  if (DRY) return;
  const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${repo}/actions/runs/${env.GITHUB_RUN_ID}` : null;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ project: extra.projekt ?? "leitstand", step, status, grund: extra.grund ?? null, issue: extra.issue ?? null, pr: extra.pr ?? null, run_id: env.GITHUB_RUN_ID ?? null, run_url: runUrl }),
  }).catch((e: Error) => ({ ok: false, status: 0, text: async () => e.message }));
  if (!res.ok) console.log(`::warning::loop_event nicht geschrieben: ${res.status} ${await res.text()}`);
}

// ------------------------------------------------------------------ Reservierung (SIN-832)

/** Dauerhafte issueweite Sperre in `leitstand_aufgaben`. Ohne Supabase gibt es keine Sperre und damit keinen Start. */
function reservierungen(titel?: Map<string, string>): ReservierungsSpeicher | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return supabaseReservierung({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY, titel: (id) => titel?.get(id) });
}

const laufUrl = () => (env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${repo}/actions/runs/${env.GITHUB_RUN_ID}` : null);
/** Claude: der Dispatcher läuft nur ohne aktive Claude-Pause (oben geprüft). Codex: kein belegter Start-Adapter (SIN-832, Zuordnungsfehler). */
const CLAUDE_FREI: ProviderStand = { adapter: true, fehler: null, bis: null, versuche: 0 };
const CODEX_OHNE_ADAPTER: ProviderStand = { adapter: false, fehler: null, bis: null, versuche: 0 };
/** Strukturiertes Ereignis als JSON im vorhandenen Feld `grund` (loop_events hat keine payload-Spalte, SIN-848). */
const alsGrund = (art: string, e: Ereignis) => `reservierung_${art}: ${JSON.stringify(e)}`;

/**
 * Vor dem Start: Stand laden, Policy fragen, atomar reservieren. Nur bei bestätigter Reservierung startet ein Worker.
 * Speicherfehler, verlorener Compare-and-swap oder ein vorhandener Claim verhindern den Start; nichts wird blind freigegeben.
 */
async function reserviereStart(speicher: ReservierungsSpeicher | null, i: LinearIssue, projekt: string): Promise<boolean> {
  if (!speicher) {
    await ereignis("dispatch", "uebersprungen", { projekt, issue: i.identifier, grund: "reservierung_fehlt: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt, kein Start ohne dauerhafte Sperre (SIN-832)" });
    return false;
  }
  const links = [laufUrl()].filter((x): x is string => !!x);
  let stand;
  try {
    stand = await speicher.laden(i.identifier);
  } catch (e) {
    await ereignis("dispatch", "fehler", { projekt, issue: i.identifier, grund: fehlergrund(`reservierung_unlesbar: ${(e as Error).message}`) });
    return false;
  }
  const a = auftragAus(stand, { pr: null, branch: null, codexGeeignet: false });
  const e = planeFallback(a, { claude: CLAUDE_FREI, codex: CODEX_OHNE_ADAPTER }, new Date(), links);
  if (e.status !== "startbereit") {
    await ereignis("dispatch", "uebersprungen", { projekt, issue: i.identifier, grund: alsGrund(e.status, e) });
    return false;
  }
  const claim = `gh-${env.GITHUB_RUN_ID ?? "lokal"}-${i.identifier}`;
  if (!(await reserviere(a, e, claim, speicher))) {
    await ereignis("dispatch", "uebersprungen", { projekt, issue: i.identifier, grund: alsGrund("verloren", { ...e, status: "wartend" }) });
    return false;
  }
  console.log(`Reserviert: ${i.identifier} (${claim}, Revision ${a.revision + 1}).`);
  return true;
}

/** Nach belegtem Ende (Merge, Stopp): Claim lösen. Fehler werden gemeldet, der Zähler bleibt immer stehen. */
async function gibFrei(id: string, nachweis: string, projekt?: string) {
  const speicher = reservierungen();
  if (!speicher || DRY) return;
  try {
    const r = await speicher.laden(id);
    if (r.claim && !(await speicher.freigeben(r, nachweis))) console.log(`::warning::${id}: Claim nicht freigegeben (Stand geändert oder Beleg ungültig).`);
  } catch (e) {
    await ereignis("merge", "fehler", { projekt, issue: id, grund: fehlergrund(`reservierung_freigabe: ${(e as Error).message}`) });
  }
}

async function projektIssues(projekt: string): Promise<ProjektKnoten[]> {
  return ladeProjektIssues(linear, projekt);
}

async function setzeStatus(issueId: string, teamId: string, name: string) {
  const d = await linear<{ team: { states: { nodes: { id: string; name: string }[] } } }>(
    `query($t: String!) { team(id: $t) { states { nodes { id name } } } }`,
    { t: teamId },
  );
  const s = d.team.states.nodes.find((x) => x.name === name);
  if (!s) throw new Error(`Linear-Status „${name}“ nicht gefunden`);
  if (DRY) return console.log(`[trocken] ${issueId} → ${name}`);
  await linear(`mutation($id: String!, $s: String!) { issueUpdate(id: $id, input: { stateId: $s }) { success } }`, { id: issueId, s: s.id });
}

async function kommentar(issueId: string, body: string) {
  if (DRY) return console.log(`[trocken] Kommentar: ${body}`);
  await linear(`mutation($id: String!, $b: String!) { commentCreate(input: { issueId: $id, body: $b }) { success } }`, { id: issueId, b: body });
}

async function issueNachKennung(identifier: string) {
  const d = await linear<{ issue: { id: string; team: { id: string } } | null }>(
    `query($id: String!) { issue(id: $id) { id team { id } } }`,
    { id: identifier },
  );
  return d.issue;
}

/** Backlog-Issue auf Todo mit Label `claude` setzen und das in Linear vermerken (SIN-417). */
async function rueckeNach(i: LinearIssue, teamId: string) {
  const d = await linear<{ team: { states: { nodes: { id: string; name: string }[] }; labels: { nodes: { id: string; name: string }[] } } }>(
    `query($t: String!) { team(id: $t) { states { nodes { id name } } labels(first: 250) { nodes { id name } } } }`,
    { t: teamId },
  );
  const todo = d.team.states.nodes.find((x) => x.name === "Todo");
  const label = d.team.labels.nodes.find((x) => x.name.toLowerCase() === LABEL);
  if (!todo || !label) throw new Error("Status „Todo“ oder Label „claude“ in Linear nicht gefunden");
  if (DRY) return console.log(`[trocken] würde nachrücken: ${i.identifier}`);
  await linear(`mutation($id: String!, $s: String!, $l: [String!]) { issueUpdate(id: $id, input: { stateId: $s, addedLabelIds: $l }) { success } }`, {
    id: i.id,
    s: todo.id,
    l: [label.id],
  });
  await kommentar(i.id, "Automatisch aus dem Backlog nachgerückt: keine anderen Leitstand-Issues mehr in der Schlange (SIN-417). Mit Label `design`, `sinan` oder `needs-human` rückt ein Issue nie nach.");
  console.log(`Nachgerückt: ${i.identifier}`);
}

/** Passende Lehren und Skills für das Issue (SIN-512). Fehlt der Ordner, gibt es keine Hinweise. */
function lehrenHinweise(i: LinearIssue): string {
  try {
    const lehren = readdirSync(LEHREN_ORDNER)
      .filter((d) => d.endsWith(".md") && d !== "INDEX.md")
      .map((d) => leseLehre(`${LEHREN_ORDNER}/${d}`, readFileSync(`${LEHREN_ORDNER}/${d}`, "utf8")));
    const skills = existsSync("docs/skills") ? readdirSync("docs/skills").filter((s) => existsSync(`docs/skills/${s}/SKILL.md`)) : [];
    return workerHinweise(lehren, skills.filter((s) => i.labels.some((l) => s.includes(l.toLowerCase()))), null, { labels: i.labels });
  } catch {
    return "";
  }
}

/** Pause aus dem Leitstand (SIN-530): jüngstes PAUSE-Ereignis in loop_events. Ohne Supabase-Secrets oder bei Lesefehler läuft der Loop weiter. */
async function pausiert(): Promise<PauseStand> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { pausiert: false };
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events?select=step,status,created_at&step=ilike.${PAUSE_SCHRITT}&order=created_at.desc&limit=20`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!res.ok) throw new Error(String(res.status));
    return pauseStand((await res.json()) as Parameters<typeof pauseStand>[0]);
  } catch (e) {
    console.log(`::warning::Pausenstand nicht lesbar (${(e as Error).message}), Loop läuft weiter.`);
    return { pausiert: false };
  }
}

/** Version (SIN-573): Meldet der CEO `fertig`, steht der Dispatcher, bis Sinan eine Version freigibt. Wie bei der Pause: nicht lesbar = läuft weiter. */
async function versionHaelt(): Promise<boolean> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events?select=project,step,status,grund,created_at&project=eq.leitstand&step=eq.${VERSION_SCHRITT}&order=created_at.desc&limit=20`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!res.ok) throw new Error(String(res.status));
    return haelt(staende(await res.json())[0]);
  } catch (e) {
    console.log(`::warning::Versionsstand nicht lesbar (${(e as Error).message}), Loop läuft weiter.`);
    return false;
  }
}

async function dispatch() {
  if (await versionHaelt()) {
    console.log("Leitstand wartet auf eine freigegebene Version (CEO: fertig). Nichts gestartet.");
    await ereignis("dispatch", "uebersprungen", { grund: "version_haelt: CEO meldet fertig, keine Version freigegeben" });
    return;
  }
  const pause = await pausiert();
  if (pause.pausiert) {
    console.log(`Loop pausiert seit ${pause.seit}. Nichts gestartet.`);
    await ereignis("dispatch", "uebersprungen", { grund: `pause: seit ${pause.seit}` });
    return;
  }
  // Kontingent (SIN-581): Der Worker braucht Claude. Läuft eine Pause, startet nichts.
  const claudePause = aktivePause(await ladeOffenePausen(), "claude", new Date());
  if (claudePause) {
    console.log(`Nicht gestartet. ${pauseSatz(claudePause, new Date())}`);
    await ereignis("dispatch", "uebersprungen", { grund: `claude_pause: ${pauseSatz(claudePause, new Date())}` });
    return;
  }
  // SIN-633: Unter dem Puffer pausiert der Loop, bei knappem Rest laufen nur Stufe 1–2.
  const rest = await ladeClaudeRest();
  if (rest !== null && knappSatz(rest)) console.log(knappSatz(rest));
  // SIN-763: je Produkt mit Repo und Linear-Projekt; ein Fehler in einem Repo stoppt die anderen nicht. Platz (max) gilt je Repo.
  let fehler = false;
  for (const ziel of loopZiele()) {
    try {
      await dispatchZiel(ziel, rest);
    } catch (e) {
      fehler = true;
      console.error(`::error::${ziel.id}: ${(e as Error).message}`);
      await ereignis("dispatch", "fehler", { projekt: ziel.id, grund: fehlergrund((e as Error).message) });
    }
  }
  if (fehler) process.exit(1);
}

/** Voraussetzung im Produkt-Repo (SIN-763): claude.yml vorhanden und Secret gesetzt. Gibt den Grund zurück, wenn etwas fehlt. */
async function fehlendeVoraussetzung(r: string): Promise<string | null> {
  const da = (pfad: string) => gh(pfad).then(() => true, () => false);
  if (!(await da(`/repos/${r}/contents/.github/workflows/claude.yml`))) return `${r} hat keine .github/workflows/claude.yml`;
  // 404 heißt: Secret fehlt oder AGENT_WORKFLOW_TOKEN darf Secrets nicht lesen; beides muss Sinan klären.
  if (!(await da(`/repos/${r}/actions/secrets/CLAUDE_CODE_OAUTH_TOKEN`))) return `${r}: Secret CLAUDE_CODE_OAUTH_TOKEN nicht gefunden (fehlt oder AGENT_WORKFLOW_TOKEN darf Secrets nicht lesen)`;
  return null;
}

/** Ein `sinan`-Issue in Linear, nur einmal je Titel (offene Issues gleichen Titels zählen). */
async function sinanIssue(teamId: string, title: string, description: string) {
  if (DRY) return console.log(`[trocken] sinan-Issue: ${title}`);
  const d = await linear<{ issues: { nodes: { id: string }[] }; team: { labels: { nodes: { id: string; name: string }[] } } }>(
    `query($t: String!, $title: String!) {
      issues(first: 1, filter: { title: { eq: $title }, state: { type: { nin: ["completed", "canceled"] } } }) { nodes { id } }
      team(id: $t) { labels(first: 250) { nodes { id name } } }
    }`,
    { t: teamId, title },
  );
  if (d.issues.nodes.length) return;
  const label = d.team.labels.nodes.find((l) => l.name.toLowerCase() === "sinan");
  await linear(`mutation($i: IssueCreateInput!) { issueCreate(input: $i) { success } }`, {
    i: { teamId, title, description, labelIds: label ? [label.id] : [] },
  });
}

async function dispatchZiel(ziel: LoopZiel, rest: number | null) {
  const repo = ziel.repo;
  const projekt = ziel.id;
  await ereignis("dispatch", "start", { projekt });
  const nodes = await projektIssues(ziel.linearProjekt);
  let issues = nodes.map(ausLinear);
  const eigenes = repo.toLowerCase() === (env.GITHUB_REPOSITORY ?? "siinanXD/Leitstand").toLowerCase();
  if (!eigenes) {
    const fehlt = await fehlendeVoraussetzung(repo);
    if (fehlt) {
      const team = nodes[0]?.team.id;
      if (team) await sinanIssue(team, `Repo ${repo} braucht claude.yml und Secret`, `Der Loop kann in ${repo} nicht bauen: ${fehlt}.\n\nKlick-Anleitung:\n1. In ${repo} die Datei .github/workflows/claude.yml aus dem Leitstand-Repo übernehmen.\n2. ${repo} → Settings → Secrets and variables → Actions → Secret CLAUDE_CODE_OAUTH_TOKEN setzen.\n3. Der Token AGENT_WORKFLOW_TOKEN braucht auf ${repo} die Rechte Issues: Read and write, Pull requests: Read, Actions secrets: Read (Settings → Developer settings → Fine-grained token → Repository access).\n\nDanach startet der Dispatcher dort automatisch (SIN-763).`);
      await ereignis("dispatch", "uebersprungen", { projekt, grund: `voraussetzung: ${fehlt}` });
      return;
    }
    // Produkt-Repos haben kein loop-merge: gemergte PRs setzen das Linear-Issue hier auf Done.
    const geschlossene = await gh<{ number: number; title: string; merged_at: string | null }[]>(`/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=30`);
    const fertig = gemergteFuerLaufende(issues, geschlossene.map((p) => ({ nummer: p.number, titel: p.title, gemergt: !!p.merged_at })));
    for (const f of fertig) await gemergt(repo, f.pr, projekt);
    issues = issues.filter((i) => !fertig.some((f) => f.identifier === i.identifier));
  }
  const ghIssues = await gh<GithubIssue[]>(`/repos/${repo}/issues?labels=claude&state=open&per_page=100`);
  const prs = await gh<{ title: string; head: { ref: string }; labels: { name: string }[] }[]>(`/repos/${repo}/pulls?state=open&per_page=100`);
  // Neueste zuerst: der jüngste gemergte PR eines Issues entscheidet, ob es nur auf Folge-Haken wartet (SIN-781).
  const zuletzt = await gh<{ title: string; body: string | null; merged_at: string | null }[]>(`/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=30`);
  const belegung: Belegung = {
    jetzt: new Date(),
    offenePrs: prs.map((p) => ({ titel: p.title, branch: p.head.ref, labels: p.labels.map((l) => l.name) })),
    teilGemergt: teilGemergte(zuletzt.map((p) => ({ titel: p.title, body: p.body, gemergt: !!p.merged_at }))),
  };
  const max = Number(env.LOOP_MAX_PARALLEL ?? 1);
  const gespiegelt = gespiegelteIds(ghIssues);
  for (const h of freigegebene(issues, belegung)) {
    console.log(`Platz von ${h.identifier} freigegeben: kein offener PR, seit ${h.startedAt ?? "?"} In Progress.`);
    await ereignis("platz", "ok", { projekt, issue: h.identifier, grund: `haenger: ohne PR länger als ${PLATZ_MINUTEN} Min` });
  }
  let wahl = waehle(issues, gespiegelt, max, belegung, rest);
  if (!wahl.length) {
    const naechstes = nachruecken(issues, gespiegelt, max, belegung);
    if (naechstes) {
      const node = nodes.find((n) => n.id === naechstes.id)!;
      await rueckeNach(naechstes, node.team.id);
      const befoerdert: LinearIssue = { ...naechstes, stateType: "unstarted", labels: [...naechstes.labels, LABEL] };
      wahl = waehle([...issues.filter((i) => i.id !== naechstes.id), befoerdert], gespiegelt, max, belegung, rest);
    }
  }
  if (!wahl.length) {
    const grund = grundNichtsStartbar(issues, gespiegelt, max, belegung);
    console.log(`Nichts zu starten. ${grund}`);
    await ereignis("dispatch", "uebersprungen", { projekt, grund });
    return;
  }
  const speicher = DRY ? null : reservierungen(new Map(wahl.map((i) => [i.identifier, i.title])));
  for (const i of wahl) {
    const { title, body } = issueText(i, [eigenes ? lehrenHinweise(i) : "", wiederaufnahme(i.description)].filter(Boolean).join("\n\n"));
    const team = nodes.find((n) => n.id === i.id)!.team.id;
    if (DRY) {
      console.log(`[trocken] würde starten: ${title}`);
      continue;
    }
    // SIN-832: erst die dauerhafte Reservierung, dann der Start. Scheitert der Start danach, bleibt der Claim (Ausgang unklar).
    if (!(await reserviereStart(speicher, i, projekt))) continue;
    const neu = await gh<{ number: number; html_url: string }>(`/repos/${repo}/issues`, { method: "POST", body: { title, body } });
    // Label getrennt setzen: das löst `issues: labeled` aus und startet claude.yml.
    await gh(`/repos/${repo}/issues/${neu.number}/labels`, { method: "POST", body: { labels: ["claude"] } });
    await setzeStatus(i.id, team, "In Progress");
    await kommentar(i.id, `Loop gestartet: ${neu.html_url}`);
    await ereignis("dispatch", "ok", { projekt, issue: i.identifier });
    console.log(`Gestartet: ${i.identifier} → #${neu.number}`);
  }
}

/** Issue mit Text und bisherigen Kommentaren, für den Haken-Abgleich (SIN-754). */
async function issueMitHaken(identifier: string) {
  const d = await linear<{ issue: { id: string; description: string | null; team: { id: string }; comments: { nodes: { body: string }[] } } | null }>(
    `query($id: String!) { issue(id: $id) { id description team { id } comments(first: 100) { nodes { body } } } }`,
    { id: identifier },
  );
  return d.issue;
}

/** Label am Linear-Issue setzen (z. B. needs-human). */
async function labelSetzen(issueId: string, teamId: string, name: string) {
  const d = await linear<{ team: { labels: { nodes: { id: string; name: string }[] } } }>(`query($t: String!) { team(id: $t) { labels(first: 250) { nodes { id name } } } }`, { t: teamId });
  const l = d.team.labels.nodes.find((x) => x.name.toLowerCase() === name);
  if (!l) throw new Error(`Linear-Label „${name}“ nicht gefunden`);
  if (DRY) return console.log(`[trocken] Label ${name}`);
  await linear(`mutation($id: String!, $l: [String!]) { issueUpdate(id: $id, input: { addedLabelIds: $l }) { success } }`, { id: issueId, l: [l.id] });
}

async function gemergt(repo: string, pr: number, projekt?: string) {
  const p = await gh<{ title: string; body: string | null; html_url: string; merged: boolean }>(`/repos/${repo}/pulls/${pr}`);
  if (!p.merged) return console.log(`PR #${pr} ist nicht gemergt.`);
  const id = linearId(p.title);
  if (!id) return console.log(`PR #${pr}: keine Linear-Kennung im Titel.`);
  const issue = await issueMitHaken(id);
  if (!issue) return console.log(`${id} nicht in Linear gefunden.`);
  // SIN-754: Done nur, wenn alle Fertig-Kriterien belegt sind und der PR kein „Part of“ ist.
  const belege = leseBelege((await gh<{ body: string }[]>(`/repos/${repo}/issues/${pr}/comments?per_page=100`)).map((c) => c.body));
  const runde = issue.comments.nodes.filter((c) => c.body.includes(RUNDE_MARKER)).length + 1;
  const e = entscheide({ haken: leseHaken(issue.description), belege, teil: istTeil(p.title, p.body), runde });
  if (e.belegt.length && issue.description && !DRY) await linear(`mutation($id: String!, $d: String!) { issueUpdate(id: $id, input: { description: $d }) { success } }`, { id: issue.id, d: setzeHaken(issue.description, e.belegt) });
  await kommentar(issue.id, kommentarText(e, belege ?? [], runde, p.html_url));
  if (e.status === "done") await setzeStatus(issue.id, issue.team.id, "Done");
  else if (e.status === "needs-human") await labelSetzen(issue.id, issue.team.id, "needs-human");
  // Offen: zurück auf Todo, der nächste Dispatch gibt dem Worker die offenen Haken mit.
  else await setzeStatus(issue.id, issue.team.id, "Todo");
  // SIN-760: Spiegel schließen (falls `Closes #N` es nicht schon tat), sonst startet das Issue nie wieder.
  const offene = await gh<GithubIssue[]>(`/repos/${repo}/issues?labels=claude&state=open&per_page=100`);
  for (const n of offeneSpiegel(offene, id)) await gh(`/repos/${repo}/issues/${n}`, { method: "PATCH", body: { state: "closed" } });
  // SIN-832: Der Worker ist mit dem Merge belegt fertig; der Claim geht, der Reparaturzähler bleibt.
  await gibFrei(id, p.html_url, projekt);
  if (e.status === "done") await ereignis("merge", "ok", { projekt, issue: id, pr });
  else await ereignis("merge", "uebersprungen", { projekt, issue: id, pr, grund: `haken_offen: ${e.grund}` });
}

async function reparaturLauf() {
  const pr = Number(arg("pr"));
  const lauf = arg("lauf") ?? "";
  const p = await gh<{ title: string; head: { ref: string }; labels: { name: string }[]; state: string }>(`/repos/${repo}/pulls/${pr}`);
  if (p.state !== "open" || !p.head.ref.startsWith("claude/")) return console.log(`PR #${pr}: nicht offen oder kein Claude-Branch.`);
  const id = linearId(p.title);
  // SIN-832: issueweiter, dauerhafter Zähler; ohne lesbaren Stand keine weitere Runde (Stopp statt Raten).
  const speicher = id ? reservierungen() : null;
  let stand = null;
  try {
    stand = id && speicher ? await speicher.laden(id) : null;
  } catch (e) {
    await ereignis("repair", "fehler", { issue: id ?? undefined, pr, grund: fehlergrund(`reservierung_unlesbar: ${(e as Error).message}`) });
    return;
  }
  const schritt = reparatur(p.labels.map((l) => l.name), stand?.reparaturen ?? 0);
  if ("stopp" in schritt) {
    if (p.labels.some((l) => l.name === "needs-human")) return console.log(`PR #${pr}: wartet schon auf Sinan.`);
    if (DRY) return console.log(`[trocken] Stopp für #${pr}`);
    await gh(`/repos/${repo}/issues/${pr}/labels`, { method: "POST", body: { labels: ["needs-human"] } });
    await gh(`/repos/${repo}/issues/${pr}/comments`, { method: "POST", body: { body: `build ist nach 3 Reparaturrunden noch rot (${lauf}). Stopp, Sinan entscheidet.` } });
    if (id) {
      const issue = await issueNachKennung(id);
      if (issue) await kommentar(issue.id, `Blocker: PR #${pr} nach 3 Reparaturrunden rot. ${lauf}`);
    }
    await ereignis("repair", "fehler", { issue: id ?? undefined, pr, grund: fehlergrund(`Test rot: build nach 3 Reparaturrunden noch rot (${lauf})`) });
    // SIN-832: Stopp ist ein belegtes Ende des Workers; Claim lösen, Zähler bleibt, needs-human hält das Issue an.
    if (id) await gibFrei(id, `https://github.com/${repo}/pull/${pr}`);
    return;
  }
  if (DRY) return console.log(`[trocken] Runde ${schritt.runde} für #${pr}`);
  // Erst zählen, dann bitten: verliert der Zähler das Compare-and-swap, startet keine Runde (sonst unbegrenzt).
  if (stand && speicher && !(await speicher.zaehleReparatur(stand))) {
    await ereignis("repair", "uebersprungen", { issue: id ?? undefined, pr, grund: "reservierung_verloren: Reparaturzähler hat sich parallel geändert, keine Runde" });
    return;
  }
  await gh(`/repos/${repo}/issues/${pr}/labels`, { method: "POST", body: { labels: [`repair:${schritt.runde}`] } });
  await gh(`/repos/${repo}/issues/${pr}/comments`, {
    method: "POST",
    body: {
      body: `@claude Der Check build ist rot (${lauf}). Ursache im Log suchen, beheben, npm run typecheck, npm run lint und npm test lokal grün, dann auf diesen Branch pushen. Runde ${schritt.runde} von 3.`,
    },
  });
  await ereignis("repair", "start", { issue: id ?? undefined, pr });
}

const befehl = process.argv[2];
const laeufe: Record<string, () => Promise<unknown>> = { dispatch, gemergt: () => gemergt(repo, Number(arg("pr"))), reparatur: reparaturLauf };
const lauf = laeufe[befehl ?? ""];
if (!lauf) {
  console.error("Befehl: dispatch | gemergt --pr N | reparatur --pr N --lauf URL");
  process.exit(2);
}
lauf().catch(async (e: Error) => {
  console.error(`::error::${e.message}`);
  await ereignis(befehl === "reparatur" ? "repair" : befehl === "gemergt" ? "merge" : "dispatch", "fehler", { grund: fehlergrund(e.message) });
  process.exit(1);
});
