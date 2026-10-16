/**
 * Planer (SIN-636; der Pfad stammt vom Vorarbeiter, SIN-553, der im Planer aufgegangen ist). Aufruf aus planer.yml (.github/workflows/planer.yml):
 * täglich 04:00 UTC vor dem CEO, nach jedem Merge, bei geänderter docs/FERTIG.md und nach dem Abnahme-Lauf:
 *
 *   npx tsx scripts/vorarbeiter/vorarbeiter.ts
 *
 * Legt zuerst fehlende Issues an (unter 3 startbar: Leitstand aus docs/FERTIG.md, Lern-App über deren planner.yml; Dubletten-Prüfung gegen alle Titel).
 * Liest die offenen Issues des Linear-Projekts „Leitstand“, plant die Spuren A bis C (src/lib/vorarbeiter/vorarbeiter.ts) und schreibt den Plan
 * in `loop_snapshot.plan`. Spur C baut danach das erste Docs-Issue per API mit Haiku (Deckel 2 € je Tag, Kosten ins Ledger) und öffnet einen PR.
 * Der Vorarbeiter mergt nie.
 *
 * Env: LINEAR_API_KEY, GH_TOKEN (AGENT_WORKFLOW_TOKEN), GITHUB_REPOSITORY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * für Spur C zusätzlich ANTHROPIC_API_KEY, VORARBEITER_PREIS_EIN_USD und VORARBEITER_PREIS_AUS_USD (USD je Million Token), KOSTEN_USD_EUR.
 * DRY_RUN=1 oder fehlende Supabase-Variablen: nur Ausgabe im Log, nichts geschrieben, Spur C läuft nicht.
 */
import { readFile } from "node:fs/promises";
import { luecke, startbar } from "../../src/lib/ceo/ceo";
import { pruefeDubletten } from "../../src/lib/ceo/fertig";
import { ausLinear, PROJEKT, type LinearIssue } from "../../src/lib/loop/auswahl";
import { PROJEKTE } from "../../src/lib/projekte";
import { parseSnapshot } from "../../src/lib/uebersicht";
import { ANSTOSS_FENSTER_MS, ANSTOSS_SCHRITT, anstossEntscheidung, anstossZeile, aufrufKosten, ereignisZeile, ledgerZeile, leseDateien, OHNE_TODOS_SCHRITT, pfade, plane, prFuerC, promptC, restDeckel, SPUR_C_MODELL, type Plan } from "../../src/lib/vorarbeiter/vorarbeiter";

const env = process.env;
const DRY = env.DRY_RUN === "1" || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY;
const repo = env.GITHUB_REPOSITORY ?? "siinanXD/Leitstand";

async function linear<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (!env.LINEAR_API_KEY) throw new Error("LINEAR_API_KEY fehlt");
  const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { "Content-Type": "application/json", Authorization: env.LINEAR_API_KEY }, body: JSON.stringify({ query, variables }) });
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (!res.ok || json.errors) throw new Error(`Linear: ${res.status} ${JSON.stringify(json.errors ?? "")}`);
  return json.data as T;
}

const kopf = { apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? "", Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`, "Content-Type": "application/json" };
async function supabase(pfad: string, methode: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown): Promise<unknown> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${pfad}`, { method: methode, headers: kopf, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`Supabase ${methode} ${pfad.split("?")[0]}: ${res.status}`);
  return methode === "GET" ? res.json() : null;
}

async function gh<T>(pfad: string, init: { method?: string; body?: unknown } = {}): Promise<T | null> {
  if (!env.GH_TOKEN) throw new Error("GH_TOKEN fehlt (Secret AGENT_WORKFLOW_TOKEN)");
  const res = await fetch(`https://api.github.com/repos/${repo}${pfad}`, { method: init.method ?? "GET", headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" }, body: init.body ? JSON.stringify(init.body) : undefined });
  if (res.status === 404 && !init.method) return null;
  if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${pfad}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

type Knoten = Parameters<typeof ausLinear>[0] & { team: { id: string } };

async function projektIssues(): Promise<{ issue: LinearIssue; team: string }[]> {
  const d = await linear<{ issues: { nodes: Knoten[] } }>(
    `query($p: String!) {
      issues(first: 100, filter: { project: { name: { eq: $p } }, state: { type: { in: ["backlog", "unstarted", "started"] } } }) {
        nodes { id identifier title description priority url createdAt team { id }
          labels { nodes { name } } state { type }
          inverseRelations { nodes { type issue { identifier state { type } } } } }
      }
    }`,
    { p: PROJEKT },
  );
  return d.issues.nodes.map((n) => ({ issue: ausLinear(n), team: n.team.id }));
}

/** Plan in `loop_snapshot.plan` der Zeile `leitstand` ablegen. `loop_snapshot` hat eine Zeile je Projekt (Schlüssel `project`), keine Titel-Spalte. */
async function schreibePlan(plan: Plan) {
  const vorhanden = (await supabase("loop_snapshot?select=project&project=eq.leitstand", "GET")) as unknown[];
  if (vorhanden.length) await supabase("loop_snapshot?project=eq.leitstand", "PATCH", { plan, updated_at: plan.erstellt });
  else await supabase("loop_snapshot", "POST", { project: "leitstand", quotas: [], queue: {}, open_prs: [], plan, updated_at: plan.erstellt });
  const run = env.GITHUB_RUN_ID;
  await supabase("loop_events", "POST", ereignisZeile("leitstand", run ?? null, run ? `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${repo}/actions/runs/${run}` : null));
}

/** Bisher heute ausgegeben (UTC-Tag) laut Ledger. Zählt alle Posten des Ledgers, also eher zu streng als zu locker. */
async function heuteAusgegeben(): Promise<number> {
  const tag = new Date().toISOString().slice(0, 10);
  const zeilen = (await supabase(`pipeline_run_costs?select=cost_eur&created_at=gte.${tag}T00:00:00Z`, "GET")) as { cost_eur?: number | string }[];
  return zeilen.reduce((s, z) => s + (Number(z.cost_eur) || 0), 0);
}

/** Spur C: ein Docs-Issue bauen. Gibt eine Zeile fürs Log zurück. */
async function baueSpurC(i: LinearIssue, team: string, plan: Plan): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) return "Spur C: ANTHROPIC_API_KEY fehlt, nichts gebaut.";
  const preis = { einProMio: Number(env.VORARBEITER_PREIS_EIN_USD), ausProMio: Number(env.VORARBEITER_PREIS_AUS_USD) };
  const kurs = Number((env.KOSTEN_USD_EUR ?? "").replace(",", "."));
  if (!(preis.einProMio > 0) || !(preis.ausProMio > 0) || !(kurs > 0)) return "Spur C: Preise oder KOSTEN_USD_EUR fehlen, ohne Kosten wird nicht gebaut.";
  const rest = restDeckel(await heuteAusgegeben());
  if (rest <= 0) return "Spur C: Tagesdeckel von 2 € erreicht, pausiert bis morgen.";

  const pr = prFuerC(i);
  if (await gh(`/git/ref/heads/${pr.branch}`)) return `Spur C: ${i.identifier} hat schon einen Branch, übersprungen.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: SPUR_C_MODELL, max_tokens: 4000, messages: [{ role: "user", content: promptC(i) }] }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Modell: ${res.status}`);
  const antwort = (await res.json()) as { content?: { text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
  // Kosten zuerst ins Ledger: der Aufruf ist bezahlt, auch wenn die Antwort danach nicht taugt.
  const eur = aufrufKosten(antwort.usage?.input_tokens ?? 0, antwort.usage?.output_tokens ?? 0, preis, kurs);
  await supabase("pipeline_run_costs", "POST", ledgerZeile(eur));

  const text = antwort.content?.[0]?.text ?? "";
  // shortcut: erstes JSON-Objekt der Antwort, bei Mischtext ausbauen auf strukturierte Ausgabe.
  let dateien;
  try {
    dateien = leseDateien(JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)), pfade(i.description));
  } catch {
    dateien = null;
  }
  if (!dateien) return `Spur C: Antwort für ${i.identifier} unbrauchbar, nichts geschrieben (${eur} € im Ledger).`;

  const main = await gh<{ object: { sha: string } }>("/git/ref/heads/main");
  await gh("/git/refs", { method: "POST", body: { ref: `refs/heads/${pr.branch}`, sha: main!.object.sha } });
  for (const d of dateien) {
    const alt = await gh<{ sha: string }>(`/contents/${d.pfad}?ref=${pr.branch}`);
    await gh(`/contents/${d.pfad}`, { method: "PUT", body: { message: `docs: ${i.title}\n\nPart of ${i.identifier}`, content: Buffer.from(d.inhalt).toString("base64"), branch: pr.branch, ...(alt ? { sha: alt.sha } : {}) } });
  }
  const neu = await gh<{ html_url: string }>("/pulls", { method: "POST", body: { head: pr.branch, base: "main", title: pr.titel, body: pr.body } });
  // In Progress, damit der Dispatcher das Issue nicht noch einmal an den Worker gibt.
  const d = await linear<{ team: { states: { nodes: { id: string; name: string }[] } } }>(`query($t: String!) { team(id: $t) { states { nodes { id name } } } }`, { t: team });
  const status = d.team.states.nodes.find((s) => s.name === "In Progress");
  if (status) await linear(`mutation($id: String!, $s: String!) { issueUpdate(id: $id, input: { stateId: $s }) { success } }`, { id: i.id, s: status.id });
  plan.spuren.find((s) => s.id === "C")!.eintraege = plan.spuren.find((s) => s.id === "C")!.eintraege.filter((e) => e.issue !== i.identifier);
  return `Spur C: ${i.identifier} gebaut, ${eur} € im Ledger, ${neu?.html_url}`;
}

// ------------------------------------------------------------------ Issues anlegen (SIN-636, vorher beim CEO)

const MEILENSTEIN = "v1 Grundgerüst";
const LERNAPP_REPO = PROJEKTE.find((x) => x.id === "lernapp")?.repo;

/** Leitstand: bis zu n Issues aus den offenen Punkten in docs/FERTIG.md (Backlog, Label claude, Meilenstein „v1 Grundgerüst“); der Dispatcher rückt nach.
 *  Dubletten-Prüfung (SIN-613) auf gleiche Absicht gegen alle Titel des Projekts, auch erledigte, höchstens 3 neue je Lauf, sonst käme ein gebauter, noch offener Punkt zurück.
 *  shortcut: nur die jüngsten 250 Issues werden verglichen, bei mehr Issues im Projekt seitenweise lesen. */
async function legeLeitstandIssuesAn(n: number) {
  const md = await readFile("docs/FERTIG.md", "utf8").catch(() => "");
  if (DRY || !env.LINEAR_API_KEY) return console.log(`[trocken] leitstand: bis zu ${n} Issues aus FERTIG.md: ${pruefeDubletten(md, [], n).neu.join(" | ") || "keine offenen Punkte"}`);
  const d = await linear<{ projects: { nodes: { id: string; teams: { nodes: { id: string }[] }; projectMilestones: { nodes: { id: string; name: string }[] }; issues: { nodes: { title: string }[] } }[] } }>(
    `query($p: String!) { projects(filter: { name: { eq: $p } }) { nodes { id teams(first: 1) { nodes { id } } projectMilestones(first: 20) { nodes { id name } }
      issues(first: 250) { nodes { title } } } } }`,
    { p: PROJEKT },
  );
  const projekt = d.projects.nodes[0];
  const teamId = projekt?.teams.nodes[0]?.id;
  if (!projekt || !teamId) throw new Error(`Linear-Projekt „${PROJEKT}“ nicht gefunden`);
  const { neu: titel, uebersprungen } = pruefeDubletten(md, projekt.issues.nodes.map((i) => i.title), n);
  for (const u of uebersprungen) console.log(`leitstand: Dublette übersprungen: „${u.titel}“ ≈ „${u.vorhanden}“`);
  if (!titel.length) return console.log("leitstand: keine neuen Punkte in docs/FERTIG.md");
  const t = await linear<{ team: { states: { nodes: { id: string; name: string }[] }; labels: { nodes: { id: string; name: string }[] } } }>(`query($t: String!) { team(id: $t) { states { nodes { id name } } labels(first: 250) { nodes { id name } } } }`, { t: teamId });
  const stateId = t.team.states.nodes.find((s) => s.name === "Backlog")?.id;
  const labelId = t.team.labels.nodes.find((l) => l.name.toLowerCase() === "claude")?.id;
  if (!stateId || !labelId) throw new Error("Status „Backlog“ oder Label „claude“ in Linear nicht gefunden");
  const meilensteinId = projekt.projectMilestones.nodes.find((m) => m.name === MEILENSTEIN)?.id;
  for (const title of titel) {
    await linear(`mutation($i: IssueCreateInput!) { issueCreate(input: $i) { success } }`, { i: { teamId, projectId: projekt.id, projectMilestoneId: meilensteinId, title, priority: 2, description: "Offener Punkt aus docs/FERTIG.md (angelegt vom Planer, SIN-636).\n\n## Fertig-Kriterien\n- [ ] Der Punkt ist live und in docs/abnahme.yml mit einer grünen Probe belegt.", labelIds: [labelId], stateId } });
    console.log(`leitstand: Issue angelegt: ${title}`);
  }
}

/** Lern-App: ihr Planer (planner.yml, mit eigener Dubletten-Prüfung) wird angestoßen, höchstens alle 2 h (SIN-700).
 *  Liefert er nach 2 Anstößen in 24 h immer noch nichts Startbares, wird nicht weiter angestoßen, sondern ein Vorfall gemeldet (Push an Sinan). */
async function stosseLernappPlanerAn() {
  const jetzt = Date.now();
  const ab = new Date(jetzt - ANSTOSS_FENSTER_MS).toISOString();
  const schritte = `${ANSTOSS_SCHRITT},${OHNE_TODOS_SCHRITT}`;
  const zeilen = (DRY ? [] : await supabase(`loop_events?select=step,created_at&project=eq.lernapp&step=in.(${schritte})&created_at=gte.${ab}`, "GET")) as { step: string; created_at: string }[];
  const zeit = (schritt: string) => zeilen.filter((z) => z.step === schritt).map((z) => Date.parse(z.created_at));
  const entscheidung = anstossEntscheidung(zeit(ANSTOSS_SCHRITT), jetzt);
  const run = env.GITHUB_RUN_ID ?? null;
  const url = run ? `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${repo}/actions/runs/${run}` : null;
  if (entscheidung === "cooldown") return console.log("lernapp: Planer vor weniger als 2 h angestoßen, kein neuer Anstoß.");
  if (entscheidung === "ohne-todos") {
    console.log("lernapp: Planer liefert keine startbaren Todos, kein weiterer Anstoß.");
    if (!DRY && !zeit(OHNE_TODOS_SCHRITT).length) await supabase("loop_events", "POST", anstossZeile(OHNE_TODOS_SCHRITT, run, url));
    return;
  }
  console.log(`${DRY ? "[trocken] " : ""}lernapp: Planer anstoßen (planner.yml, dry_run=false)`);
  if (DRY || !LERNAPP_REPO) return;
  const res = await fetch(`https://api.github.com/repos/${LERNAPP_REPO}/actions/workflows/planner.yml/dispatches`, { method: "POST", headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json" }, body: JSON.stringify({ ref: "main", inputs: { dry_run: "false" } }) });
  if (!res.ok) throw new Error(`planner.yml anstoßen: ${res.status}`);
  await supabase("loop_events", "POST", anstossZeile(ANSTOSS_SCHRITT, run, url));
}

/** Unter 3 startbaren Issues je Produkt: auffüllen. Ohne Supabase-Zugang fehlt der Snapshot, dann bleibt es beim Log. */
async function fuelleAuf() {
  if (!env.SUPABASE_URL) return console.log("Auffüllen: SUPABASE_URL fehlt, Schlange unbekannt, nichts angelegt.");
  const snapshot = parseSnapshot(await supabase("loop_snapshot?select=*&limit=200", "GET"));
  const leitstand = luecke(startbar(snapshot, "leitstand"));
  if (leitstand > 0) await legeLeitstandIssuesAn(leitstand);
  if (luecke(startbar(snapshot, "lernapp")) > 0) await stosseLernappPlanerAn();
}

async function main() {
  const alle = await projektIssues();
  const plan = plane(alle.map((a) => a.issue));
  for (const s of plan.spuren) console.log(`${s.id}: ${s.eintraege.map((e) => `${e.issue} (${e.grund})`).join(" → ") || "leer"}`);
  for (const w of plan.wartet) console.log(`wartet: ${w.issue} (${w.grund})`);
  // Erst anlegen, dann planen: neue Issues stehen im Plan des nächsten Laufs (Merge oder täglich), nicht in diesem.
  await fuelleAuf();
  if (DRY) return console.log("Trockenlauf: nichts geschrieben, Spur C läuft nicht.");

  const erstes = plan.spuren.find((s) => s.id === "C")!.eintraege[0];
  const ziel = erstes && alle.find((a) => a.issue.identifier === erstes.issue);
  const meldung = ziel ? await baueSpurC(ziel.issue, ziel.team, plan).catch((e: Error) => `Spur C: ${e.message}`) : "Spur C: nichts zu bauen.";
  await schreibePlan(plan);
  console.log(meldung);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
