/**
 * Loop des Leitstands (SIN-413). Aufruf aus den Workflows:
 *
 *   npx tsx scripts/loop/loop.ts dispatch            Todo-Issues aus Linear als GitHub-Issue mit Label `claude` starten;
 *                                                    ist keins da, rückt das wichtigste Backlog-Issue nach (SIN-417)
 *   npx tsx scripts/loop/loop.ts gemergt --pr 12     Linear-Issue zum gemergten PR auf Done setzen
 *   npx tsx scripts/loop/loop.ts reparatur --pr 12 --lauf <url>   nach rotem `build`: @claude bitten oder stoppen
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
import { ausLinear, gespiegelteIds, grundNichtsStartbar, issueText, LABEL, linearId, nachruecken, PROJEKT, reparatur, waehle, type Belegung, type GithubIssue, type LinearIssue } from "../../src/lib/loop/auswahl";

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
type Extra = { issue?: string; pr?: number; grund?: string };
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
    body: JSON.stringify({ project: "leitstand", step, status, grund: extra.grund ?? null, issue: extra.issue ?? null, pr: extra.pr ?? null, run_id: env.GITHUB_RUN_ID ?? null, run_url: runUrl }),
  }).catch((e: Error) => ({ ok: false, status: 0, text: async () => e.message }));
  if (!res.ok) console.log(`::warning::loop_event nicht geschrieben: ${res.status} ${await res.text()}`);
}

type Node = Parameters<typeof ausLinear>[0] & { team: { id: string } };

async function projektIssues(): Promise<Node[]> {
  const d = await linear<{ issues: { nodes: Node[] } }>(
    `query($p: String!) {
      issues(first: 100, filter: { project: { name: { eq: $p } }, state: { type: { in: ["backlog", "unstarted", "started"] } } }) {
        nodes { id identifier title description priority url createdAt startedAt team { id }
          labels { nodes { name } } state { type }
          inverseRelations { nodes { type issue { identifier state { type } } } } }
      }
    }`,
    { p: PROJEKT },
  );
  return d.issues.nodes;
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
  await ereignis("dispatch", "start");
  const nodes = await projektIssues();
  const issues = nodes.map(ausLinear);
  const ghIssues = await gh<GithubIssue[]>(`/repos/${repo}/issues?labels=claude&state=all&per_page=100`);
  const prs = await gh<{ title: string; head: { ref: string }; labels: { name: string }[] }[]>(`/repos/${repo}/pulls?state=open&per_page=100`);
  const belegung: Belegung = { jetzt: new Date(), offenePrs: prs.map((p) => ({ titel: p.title, branch: p.head.ref, labels: p.labels.map((l) => l.name) })) };
  const max = Number(env.LOOP_MAX_PARALLEL ?? 1);
  const gespiegelt = gespiegelteIds(ghIssues);
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
    await ereignis("dispatch", "uebersprungen", { grund });
    return;
  }
  for (const i of wahl) {
    const { title, body } = issueText(i, lehrenHinweise(i));
    const team = nodes.find((n) => n.id === i.id)!.team.id;
    if (DRY) {
      console.log(`[trocken] würde starten: ${title}`);
      continue;
    }
    const neu = await gh<{ number: number; html_url: string }>(`/repos/${repo}/issues`, { method: "POST", body: { title, body } });
    // Label getrennt setzen: das löst `issues: labeled` aus und startet claude.yml.
    await gh(`/repos/${repo}/issues/${neu.number}/labels`, { method: "POST", body: { labels: ["claude"] } });
    await setzeStatus(i.id, team, "In Progress");
    await kommentar(i.id, `Loop gestartet: ${neu.html_url}`);
    await ereignis("dispatch", "ok", { issue: i.identifier });
    console.log(`Gestartet: ${i.identifier} → #${neu.number}`);
  }
}

async function gemergt() {
  const pr = Number(arg("pr"));
  const p = await gh<{ title: string; html_url: string; merged: boolean }>(`/repos/${repo}/pulls/${pr}`);
  if (!p.merged) return console.log(`PR #${pr} ist nicht gemergt.`);
  const id = linearId(p.title);
  if (!id) return console.log(`PR #${pr}: keine Linear-Kennung im Titel.`);
  const issue = await issueNachKennung(id);
  if (!issue) return console.log(`${id} nicht in Linear gefunden.`);
  await setzeStatus(issue.id, issue.team.id, "Done");
  await kommentar(issue.id, `Gemergt: ${p.html_url}`);
  await ereignis("merge", "ok", { issue: id, pr });
}

async function reparaturLauf() {
  const pr = Number(arg("pr"));
  const lauf = arg("lauf") ?? "";
  const p = await gh<{ title: string; head: { ref: string }; labels: { name: string }[]; state: string }>(`/repos/${repo}/pulls/${pr}`);
  if (p.state !== "open" || !p.head.ref.startsWith("claude/")) return console.log(`PR #${pr}: nicht offen oder kein Claude-Branch.`);
  const schritt = reparatur(p.labels.map((l) => l.name));
  const id = linearId(p.title);
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
    return;
  }
  if (DRY) return console.log(`[trocken] Runde ${schritt.runde} für #${pr}`);
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
const laeufe: Record<string, () => Promise<unknown>> = { dispatch, gemergt, reparatur: reparaturLauf };
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
