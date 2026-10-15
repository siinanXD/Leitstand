/**
 * Gedächtnis-Agent (SIN-541). Aufruf aus gedaechtnis.yml (.github/workflows/gedaechtnis.yml):
 *
 *   npx tsx scripts/gedaechtnis/schreiben.ts
 *
 * Liest loop_snapshot und loop_events (Supabase), gemergte PRs der letzten 24 h und docs/decisions/ beider Repos (GitHub)
 * und schreibt Markdown für den privaten Obsidian-Vault siinanXD/gedaechtnis. Pusht nur, wenn sich etwas geändert hat.
 * Kein KI-Aufruf, keine Rohdaten oder Traces. Legt nie ein öffentliches Repo an und ändert nie Token-Rechte.
 *
 * Gesprächs-Eingang (SIN-612): Linear-Issues mit Label `gedaechtnis` werden Notizen unter Eingang/ und nach dem Push mit Link geschlossen.
 *
 * Env: GH_TOKEN (AGENT_WORKFLOW_TOKEN), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LINEAR_API_KEY (optional, ohne ihn entfällt der Eingang).
 * Ohne Zugriff auf das Repo (SIN-540 offen) oder mit DRY_RUN=1: Trockenlauf, Ausgabe in GEDAECHTNIS_AUSGABE (Standard gedaechtnis-ausgabe/),
 * Status `braucht_sinan`, Lauf bleibt grün.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { letzteJeProdukt } from "../../src/lib/ceo/ceo";
import { EINGANG_LABEL, eingangDateien, schlussKommentar, zuSchliessen, type EingangIssue } from "../../src/lib/gedaechtnis/eingang";
import { ceoZeilen, dateien, ereignisZeile, mitGeheimnis, VAULT_REPO, type Dateien, type Eingabe, type Entscheidung, type OffenerPunkt, type Pr } from "../../src/lib/gedaechtnis/gedaechtnis";
import { PROJEKTE, alleProjekte } from "../../src/lib/projekte";
import { gedaechtnisZeilen, type Fund } from "../../src/lib/trend/trend";
import { parseEvents, parseSnapshot, type LoopEvent, type SnapshotRow } from "../../src/lib/uebersicht";
import { fortschritt } from "../../src/lib/uebersicht-einfach";
import { aufgabenFuerDich, inArbeitZeilen } from "../../src/lib/uebersicht-b1";
import { wartendePrs } from "../../src/lib/wartende-prs";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const AUSGABE = env.GEDAECHTNIS_AUSGABE ?? "gedaechtnis-ausgabe";
const REPOS_ENTSCHEIDUNGEN = ["siinanXD/Leitstand", "siinanXD/Content-Agent-Lernapp"];
const ROT = /fail|error|abort|crash|red|rot|stuck|timeout/i;

const ghKopf = { Authorization: `Bearer ${env.GH_TOKEN ?? ""}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
const gh = (pfad: string, init: RequestInit = {}) => fetch(`https://api.github.com${pfad}`, { ...init, headers: { ...ghKopf, ...init.headers } });

async function ghJson<T>(pfad: string): Promise<T | null> {
  try {
    const res = await gh(pfad);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

const supabaseKopf = { apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? "", Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY ?? ""}` };
async function supabase(pfad: string): Promise<unknown> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${pfad}`, { headers: supabaseKopf });
  if (!res.ok) throw new Error(`Supabase ${pfad.split("?")[0]}: ${res.status}`);
  return res.json();
}

type Eingang = { issues: EingangIssue[]; erledigtStatus: Map<string, string> };

async function linear<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { "Content-Type": "application/json", Authorization: env.LINEAR_API_KEY ?? "" }, body: JSON.stringify({ query, variables }) });
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (!res.ok || json.errors) throw new Error(`Linear: ${res.status}`);
  return json.data as T;
}

/** Issues mit Label `gedaechtnis` der letzten 14 Tage (auch geschlossene, damit spätere Änderungen die Notiz aktualisieren). */
async function eingang(jetzt: Date): Promise<Eingang> {
  const status = new Map<string, string>();
  if (!env.LINEAR_API_KEY) return { issues: [], erledigtStatus: status };
  const seit = new Date(jetzt.getTime() - 14 * 86_400_000).toISOString();
  const d = await linear<{ issues: { nodes: { id: string; identifier: string; title: string; description: string | null; url: string; createdAt: string; state: { type: string }; team: { states: { nodes: { id: string; type: string }[] } } }[] } }>(
    "query($l:String!,$seit:DateTimeOrDuration!){issues(first:50,filter:{labels:{name:{eq:$l}},updatedAt:{gte:$seit}}){nodes{id identifier title description url createdAt state{type} team{states{nodes{id type}}}}}}",
    { l: EINGANG_LABEL, seit },
  );
  for (const n of d.issues.nodes) status.set(n.id, n.team.states.nodes.find((s) => s.type === "completed")?.id ?? "");
  return { issues: d.issues.nodes.map((n) => ({ id: n.id, identifier: n.identifier, title: n.title, description: n.description, url: n.url, createdAt: n.createdAt, stateType: n.state.type })), erledigtStatus: status };
}

/** Legt das Label im Team SIN an, falls es fehlt. */
async function labelSichern(): Promise<void> {
  if (!env.LINEAR_API_KEY) return;
  const d = await linear<{ issueLabels: { nodes: { id: string }[] }; teams: { nodes: { id: string }[] } }>('query($l:String!){issueLabels(filter:{name:{eq:$l}}){nodes{id}} teams(filter:{key:{eq:"SIN"}}){nodes{id}}}', { l: EINGANG_LABEL });
  const team = d.teams.nodes[0]?.id;
  if (d.issueLabels.nodes.length === 0 && team) await linear("mutation($n:String!,$t:String!){issueLabelCreate(input:{name:$n,teamId:$t}){success}}", { n: EINGANG_LABEL, t: team });
}

/** Nach erfolgreichem Push: Kommentar mit Link auf die Notiz, dann Status „erledigt“. Eine Panne bei einem Issue stoppt die anderen nicht. */
async function schliesse(e: Eingang): Promise<void> {
  for (const i of zuSchliessen(e.issues)) {
    try {
      await linear("mutation($id:String!,$b:String!){commentCreate(input:{issueId:$id,body:$b}){success}}", { id: i.id, b: schlussKommentar(i.identifier) });
      const stateId = e.erledigtStatus.get(i.id);
      if (stateId) await linear("mutation($id:String!,$s:String!){issueUpdate(id:$id,input:{stateId:$s}){success}}", { id: i.id, s: stateId });
    } catch (err) {
      console.warn(`Warnung: ${i.identifier} nicht geschlossen: ${(err as Error).message}`);
    }
  }
}

/** Vault prüfen; fehlt er, einmal privat anlegen. null = kein Zugriff (SIN-540 bleibt offen). */
async function vaultDa(): Promise<boolean> {
  if (!env.GH_TOKEN) return false;
  const res = await gh(`/repos/${VAULT_REPO}`).catch(() => null);
  if (res?.ok) return true;
  if (res?.status !== 404) return false;
  const neu = await gh("/user/repos", { method: "POST", body: JSON.stringify({ name: VAULT_REPO.split("/")[1], private: true, auto_init: true }) }).catch(() => null);
  return Boolean(neu?.ok);
}

async function entscheidungen(): Promise<Entscheidung[]> {
  const je = new Map<string, Entscheidung>();
  for (const repo of REPOS_ENTSCHEIDUNGEN) {
    const projekt = PROJEKTE.find((p) => p.repo === repo)?.id ?? repo;
    const liste = await ghJson<{ name: string; html_url: string }[]>(`/repos/${repo}/contents/docs/decisions`);
    for (const f of liste ?? []) {
      const m = /^(SIN-\d+)-?(.*)\.md$/.exec(f.name);
      // shortcut: Titel aus dem Dateinamen, nicht aus der Überschrift; bei mehreren Dateien je Issue zählt die erste.
      if (m && !je.has(m[1])) je.set(m[1], { id: m[1], projekt, titel: m[2].replace(/-/g, " ") || m[1], url: f.html_url });
    }
  }
  return [...je.values()].sort((a, b) => Number(b.id.slice(4)) - Number(a.id.slice(4)));
}

async function gemergt(repos: string[], seit: Date): Promise<Pr[]> {
  const out: Pr[] = [];
  for (const repo of repos) {
    const liste = await ghJson<{ number: number; title: string; html_url: string; merged_at: string | null }[]>(`/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=50`);
    for (const p of liste ?? []) if (p.merged_at && new Date(p.merged_at) >= seit) out.push({ nummer: p.number, titel: p.title, projekt: PROJEKTE.find((x) => x.repo === repo)?.id ?? repo, url: p.html_url });
  }
  return out;
}

function offenePunkte(snapshot: SnapshotRow[]): OffenerPunkt[] {
  const aufgaben = aufgabenFuerDich(snapshot).map<OffenerPunkt>((a) => ({ titel: `${a.ref} ${a.titel}`, projekt: snapshot.find((s) => (s.issue ?? `#${s.pr}`) === a.ref)?.project ?? "", url: null, art: "sinan" }));
  const freigaben = wartendePrs(snapshot).map<OffenerPunkt>((p) => ({ titel: `PR #${p.nummer} ${p.titel}`, projekt: p.repo.split("/")[1], url: p.url, art: "freigabe" }));
  return [...aufgaben, ...freigaben];
}

async function sammle(jetzt: Date): Promise<Eingabe> {
  const seit = new Date(jetzt.getTime() - 24 * 3_600_000);
  let snapshot: SnapshotRow[] = [];
  let events: LoopEvent[] = [];
  let ceo: string[] = [];
  const probleme: string[] = [];
  try {
    snapshot = parseSnapshot(await supabase("loop_snapshot?select=*&limit=200"));
    events = parseEvents(await supabase(`loop_events?select=*&created_at=gte.${seit.toISOString()}&order=created_at.desc&limit=1000`));
    ceo = ceoZeilen(letzteJeProdukt(await supabase(`ceo_entscheidungen?select=produkt,entscheidung,grund,created_at&created_at=gte.${seit.toISOString()}&order=created_at.desc&limit=100`)));
  } catch (e) {
    probleme.push(`Daten unvollständig: ${(e as Error).message}`);
  }
  const quelle = { events, snapshot };
  const stand = new Map(fortschritt(quelle).map((f) => [f.project, f]));
  const laeuft = inArbeitZeilen(quelle, jetzt);
  const offen = offenePunkte(snapshot);
  const projekte = alleProjekte(snapshot.map((s) => s.project));
  const beschreibung = async (repo?: string) => (repo ? ((await ghJson<{ description: string | null }>(`/repos/${repo}`))?.description ?? "") : "");

  const produkte = await Promise.all(
    projekte.map(async (p) => ({
      id: p.id,
      name: p.name,
      ziel: await beschreibung(p.repo),
      fertig: stand.get(p.id)?.fertig ?? null,
      gesamt: stand.get(p.id)?.gesamt ?? null,
      laeuft: laeuft.filter((z) => z.project === p.id).map((z) => `${z.issue ?? ""} ${z.titel ?? ""}`.trim()),
      sinan: offen.filter((o) => o.projekt === p.id || o.projekt === p.repo?.split("/")[1]).map((o) => o.titel),
    })),
  );
  for (const e of events.filter((x) => x.status && ROT.test(x.status))) probleme.push(`${e.project ?? "?"}: ${e.step ?? "?"} ${e.status}${e.issue ? ` (${e.issue})` : ""}`);
  const kosten = events.reduce((s, e) => s + (e.cost ?? 0), 0);
  return {
    jetzt,
    produkte,
    prs: await gemergt(projekte.flatMap((p) => (p.repo ? [p.repo] : [])), seit),
    entscheidungen: await entscheidungen(),
    offen,
    // shortcut: nur Agenten-Kosten aus loop_events (USD), nicht die Quellen von /api/kosten; bei Bedarf dorthin umstellen.
    kostenUsd: events.length ? kosten : null,
    probleme,
    trends: trendZeilen(),
    ceo,
  };
}

/** Trend-Radar 2 (SIN-575): die besten drei Funde aus docs/markt/trends.json; fehlt die Datei, steht nichts in der Notiz. */
function trendZeilen(): string[] {
  try {
    return gedaechtnisZeilen((JSON.parse(readFileSync("docs/markt/trends.json", "utf8")) as { funde?: Fund[] }).funde ?? []);
  } catch {
    return [];
  }
}

function schreibeLokal(ziel: string, d: Dateien) {
  for (const [pfad, text] of Object.entries(d)) {
    mkdirSync(dirname(join(ziel, pfad)), { recursive: true });
    writeFileSync(join(ziel, pfad), text);
  }
}

const git = (cwd: string, ...args: string[]) => {
  const auth = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${env.GH_TOKEN}`).toString("base64")}`;
  try {
    return execFileSync("git", ["-c", `http.extraHeader=${auth}`, ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    // Die Meldung von execFileSync enthielte den Kopf mit dem Token; nur stderr weitergeben.
    throw new Error(`git ${args[0]} fehlgeschlagen: ${String((e as { stderr?: string }).stderr ?? "").slice(0, 300)}`);
  }
};

/** Klont den Vault, schreibt die Dateien, pusht bei Änderung. Gibt zurück, ob gepusht wurde. */
function pushe(d: Dateien, jetzt: Date): boolean {
  const dir = mkdtempSync(join(tmpdir(), "gedaechtnis-"));
  try {
    git(dir, "clone", "--depth", "1", `https://github.com/${VAULT_REPO}.git`, ".");
    schreibeLokal(dir, d);
    git(dir, "add", "-A");
    if (!git(dir, "status", "--porcelain").trim()) return false;
    git(dir, "-c", "user.name=gedaechtnis-agent", "-c", "user.email=gedaechtnis-agent@users.noreply.github.com", "commit", "-m", `Stand ${jetzt.toISOString().slice(0, 10)}`);
    git(dir, "push", "origin", "HEAD");
    return true;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const jetzt = new Date();
  const ein = await eingang(jetzt).catch((e: Error): Eingang => {
    console.warn(`Warnung: Eingang übersprungen: ${e.message}`);
    return { issues: [], erledigtStatus: new Map() };
  });
  const d = { ...dateien(await sammle(jetzt)), ...eingangDateien(ein.issues) };
  const treffer = mitGeheimnis(d);
  if (treffer.length) {
    console.error(`Abbruch: Inhalt sieht nach Geheimnis aus in ${treffer.join(", ")}. Nichts geschrieben.`);
    process.exit(1);
  }
  const zugriff = !DRY && (await vaultDa());
  if (!zugriff) {
    schreibeLokal(AUSGABE, d);
    console.log(`status: braucht_sinan\nTrockenlauf${DRY ? "" : ` (kein Zugriff auf ${VAULT_REPO}, SIN-540 offen)`}: ${Object.keys(d).length} Dateien nach ${AUSGABE}/.`);
    return;
  }
  const gepusht = pushe(d, jetzt);
  // Geschlossen wird erst, wenn die Notizen im Vault liegen (auch bei „keine Änderung“: dann lagen sie schon dort).
  await labelSichern().catch(() => undefined);
  await schliesse(ein);
  console.log(gepusht ? `${Object.keys(d).length} Dateien geprüft, Änderungen nach ${VAULT_REPO} gepusht.` : "Keine Änderung, nichts gepusht.");
  if (gepusht && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const run = env.GITHUB_RUN_ID;
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events`, {
      method: "POST",
      headers: { ...supabaseKopf, "Content-Type": "application/json" },
      body: JSON.stringify(ereignisZeile(run ?? null, run ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${run}` : null)),
    }).catch(() => null);
    if (!res?.ok) console.warn("Warnung: Ereignis in loop_events nicht geschrieben.");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
