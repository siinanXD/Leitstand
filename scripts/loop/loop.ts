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
import { ausLinear, gespiegelteIds, issueText, LABEL, linearId, nachruecken, PROJEKT, reparatur, waehle, type GithubIssue, type LinearIssue } from "../../src/lib/loop/auswahl";

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
async function ereignis(step: string, status: "start" | "ok" | "fehler" | "uebersprungen", extra: { issue?: string; pr?: number } = {}) {
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
    body: JSON.stringify({ project: "leitstand", step, status, issue: extra.issue ?? null, pr: extra.pr ?? null, run_id: env.GITHUB_RUN_ID ?? null, run_url: runUrl }),
  }).catch((e: Error) => ({ ok: false, status: 0, text: async () => e.message }));
  if (!res.ok) console.log(`::warning::loop_event nicht geschrieben: ${res.status} ${await res.text()}`);
}

type Node = Parameters<typeof ausLinear>[0] & { team: { id: string } };

async function projektIssues(): Promise<Node[]> {
  const d = await linear<{ issues: { nodes: Node[] } }>(
    `query($p: String!) {
      issues(first: 100, filter: { project: { name: { eq: $p } }, state: { type: { in: ["backlog", "unstarted", "started"] } } }) {
        nodes { id identifier title description priority url createdAt team { id }
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

async function dispatch() {
  await ereignis("dispatch", "start");
  const nodes = await projektIssues();
  const issues = nodes.map(ausLinear);
  const ghIssues = await gh<GithubIssue[]>(`/repos/${repo}/issues?labels=claude&state=all&per_page=100`);
  const max = Number(env.LOOP_MAX_PARALLEL ?? 1);
  const gespiegelt = gespiegelteIds(ghIssues);
  let wahl = waehle(issues, gespiegelt, max);
  if (!wahl.length) {
    const naechstes = nachruecken(issues, gespiegelt, max);
    if (naechstes) {
      const node = nodes.find((n) => n.id === naechstes.id)!;
      await rueckeNach(naechstes, node.team.id);
      const befoerdert: LinearIssue = { ...naechstes, stateType: "unstarted", labels: [...naechstes.labels, LABEL] };
      wahl = waehle([...issues.filter((i) => i.id !== naechstes.id), befoerdert], gespiegelt, max);
    }
  }
  if (!wahl.length) {
    console.log("Nichts zu starten (keine freien Plätze oder keine Todo-Issues mit Label claude).");
    await ereignis("dispatch", "uebersprungen");
    return;
  }
  for (const i of wahl) {
    const { title, body } = issueText(i);
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
    await ereignis("repair", "fehler", { issue: id ?? undefined, pr });
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
  await ereignis(befehl === "reparatur" ? "repair" : befehl === "gemergt" ? "merge" : "dispatch", "fehler");
  process.exit(1);
});
