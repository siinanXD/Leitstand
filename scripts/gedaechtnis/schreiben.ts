/**
 * Gedächtnis-Agent (SIN-541). Aufruf aus gedaechtnis.yml (.github/workflows/gedaechtnis.yml):
 *
 *   npx tsx scripts/gedaechtnis/schreiben.ts
 *
 * Liest loop_snapshot und loop_events (Supabase), gemergte PRs der letzten 24 h und docs/decisions/ beider Repos (GitHub)
 * und schreibt Markdown für den privaten Obsidian-Vault siinanXD/gedaechtnis. Pusht nur, wenn sich etwas geändert hat.
 * Kein KI-Aufruf, keine Rohdaten oder Traces. Legt nie ein öffentliches Repo an und ändert nie Token-Rechte.
 *
 * Gesprächs-Eingang (SIN-612): Linear-Issues mit Label `gedaechtnis` werden Notizen unter Gespräche/ und nach dem Push mit Link geschlossen.
 *
 * Env: GH_TOKEN (AGENT_WORKFLOW_TOKEN), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LINEAR_API_KEY (optional, ohne ihn entfällt der Eingang).
 * Ohne Zugriff auf das Repo (SIN-540 offen) oder mit DRY_RUN=1: Trockenlauf, Ausgabe in GEDAECHTNIS_AUSGABE (Standard gedaechtnis-ausgabe/),
 * Status `braucht_sinan`, Lauf bleibt grün.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readFile } from "node:fs/promises";
import { letzteJeProdukt } from "../../src/lib/ceo/ceo";
import { zaehleHaken } from "../../src/lib/ceo/fertig";
import { EINGANG_LABEL, eingangDateien, schlussKommentar, zuSchliessen, type EingangIssue } from "../../src/lib/gedaechtnis/eingang";
import { ceoZeilen, dateien, ereignisZeile, mitGeheimnis, tagBerlin, vereinige, VAULT_REPO, type Dateien, type Eingabe, type Entscheidung, type Erledigt, type OffenerPunkt, type Pr, type Quelle } from "../../src/lib/gedaechtnis/gedaechtnis";
import { notizPfad } from "../../src/lib/wochencheck/wochencheck";
import { abschliessen } from "../../src/lib/gedaechtnis/vault";
import { fehlerNotizen, lehrenAusDatei, lehrenAusFehlern, type FehlerZeile } from "../../src/lib/gedaechtnis/lernen";
import { PROJEKTE, alleProjekte } from "../../src/lib/projekte";
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

/** `null`, sobald ein Repo nicht antwortet: „Nichts gemergt“ wäre dann falsch. */
async function gemergt(repos: string[], seit: Date): Promise<Pr[] | null> {
  const out: Pr[] = [];
  for (const repo of repos) {
    const liste = await ghJson<{ number: number; title: string; html_url: string; merged_at: string | null }[]>(`/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=50`);
    if (!liste) return null;
    for (const p of liste) if (p.merged_at && new Date(p.merged_at) >= seit) out.push({ nummer: p.number, titel: p.title, projekt: PROJEKTE.find((x) => x.repo === repo)?.id ?? repo, url: p.html_url });
  }
  return out;
}

type LinearZeile = { identifier: string; title: string; url: string; project: { name: string } | null };

/** Alle offenen Issues mit Label `sinan` direkt aus Linear (der Snapshot kennt nur einen Teil). */
async function sinanIssues(): Promise<OffenerPunkt[]> {
  const d = await linear<{ issues: { nodes: LinearZeile[] } }>(
    'query{issues(first:100,filter:{labels:{name:{eq:"sinan"}},state:{type:{nin:["completed","canceled"]}}}){nodes{identifier title url project{name}}}}',
  );
  return d.issues.nodes.map((n) => ({ titel: `${n.identifier} ${n.title}`, projekt: n.project?.name ?? "Linear", url: n.url, art: "sinan" }));
}

/** In den letzten 24 h in Linear erledigte Issues. */
async function erledigtIssues(seit: Date): Promise<Erledigt[]> {
  const d = await linear<{ issues: { nodes: Pick<LinearZeile, "identifier" | "title">[] } }>(
    "query($seit:DateTimeOrDuration!){issues(first:50,filter:{completedAt:{gte:$seit}}){nodes{identifier title}}}",
    { seit: seit.toISOString() },
  );
  return d.issues.nodes.map((n) => ({ id: n.identifier, titel: n.title }));
}

/** Content-Fabrik (Lern-App): jüngstes Ereignis der letzten 2 h mit „content“ oder „fabrik“ im Schritt oder Agenten, das nicht rot ist. */
function fabrikZeile(events: LoopEvent[], jetzt: Date): string | null {
  const grenze = jetzt.getTime() - 2 * 3_600_000;
  const e = events.find((x) => Date.parse(x.created_at) >= grenze && /content|fabrik/i.test(`${x.step ?? ""} ${x.agent ?? ""}`) && !(x.status && ROT.test(x.status)));
  return e ? `Content-Fabrik (zuletzt ${new Date(e.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })} Uhr)` : null;
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
  const fehlt: Quelle[] = [];
  const meldeFehlt = (q: Quelle, e: unknown) => {
    fehlt.push(q);
    probleme.push(`Quelle nicht erreichbar (${q}): ${(e as Error).message}`);
  };
  try {
    snapshot = parseSnapshot(await supabase("loop_snapshot?select=*&limit=200"));
    events = parseEvents(await supabase(`loop_events?select=*&created_at=gte.${seit.toISOString()}&order=created_at.desc&limit=1000`));
  } catch (e) {
    meldeFehlt("Supabase", e);
  }
  if (!fehlt.includes("Supabase")) {
    try {
      ceo = ceoZeilen(letzteJeProdukt(await supabase(`ceo_entscheidungen?select=produkt,entscheidung,grund,created_at&created_at=gte.${seit.toISOString()}&order=created_at.desc&limit=100`)));
    } catch (e) {
      probleme.push(`CEO-Entscheidungen nicht gelesen: ${(e as Error).message}`);
    }
  }
  // Linear: ohne Schlüssel oder bei Fehler „Quelle nicht erreichbar“, nie „nichts offen“.
  let linearOffen: OffenerPunkt[] | null = null;
  let erledigt: Erledigt[] | null = null;
  try {
    if (!env.LINEAR_API_KEY) throw new Error("LINEAR_API_KEY fehlt");
    linearOffen = await sinanIssues();
    erledigt = await erledigtIssues(seit);
  } catch (e) {
    linearOffen = null;
    erledigt = null;
    meldeFehlt("Linear", e);
  }
  const supabaseOk = !fehlt.includes("Supabase");
  const quelle = { events, snapshot };
  const stand = new Map(fortschritt(quelle).map((f) => [f.project, f]));
  // Der Leitstand zählt seine eigene Fertig-Liste, falls der Snapshot keinen Stand trägt (Befund 14.10.: „Stand unbekannt“).
  const eigener = await readFile("docs/FERTIG.md", "utf8").then(zaehleHaken, () => null);
  const laeuft = inArbeitZeilen(quelle, jetzt);
  const fabrik = fabrikZeile(events, jetzt);
  const offen = vereinige(linearOffen ?? [], offenePunkte(snapshot));
  const projekte = alleProjekte([...PROJEKTE.filter((p) => p.repo).map((p) => p.id), ...snapshot.map((s) => s.project)]);
  const beschreibung = async (repo?: string) => (repo ? ((await ghJson<{ description: string | null }>(`/repos/${repo}`))?.description ?? "") : "");
  const gehoertZu = (o: OffenerPunkt, p: (typeof projekte)[number]) => [p.id, p.name, p.repo?.split("/")[1]].some((n) => n && n.toLowerCase() === o.projekt.toLowerCase());

  const produkte = await Promise.all(
    projekte.map(async (p) => ({
      id: p.id,
      name: p.name,
      ziel: await beschreibung(p.repo),
      fertig: stand.get(p.id)?.fertig ?? (p.id === "leitstand" ? (eigener?.fertig ?? null) : null),
      gesamt: stand.get(p.id)?.gesamt ?? (p.id === "leitstand" ? (eigener?.gesamt ?? null) : null),
      laeuft: supabaseOk ? [...laeuft.filter((z) => z.project === p.id).map((z) => `${z.issue ?? ""} ${z.titel ?? ""}`.trim()), ...(p.id === "lernapp" && fabrik ? [fabrik] : [])] : null,
      sinan: linearOffen && supabaseOk ? offen.filter((o) => gehoertZu(o, p)).map((o) => o.titel) : null,
    })),
  );
  for (const e of events.filter((x) => x.status && ROT.test(x.status))) probleme.push(`${e.project ?? "?"}: ${e.step ?? "?"} ${e.status}${e.issue ? ` (${e.issue})` : ""}`);
  const kosten = events.reduce((s, e) => s + (e.cost ?? 0), 0);
  const prs = await gemergt(projekte.flatMap((p) => (p.repo ? [p.repo] : [])), seit);
  if (!prs) meldeFehlt("GitHub", new Error("Pull Requests nicht lesbar"));
  return {
    jetzt,
    produkte,
    prs,
    erledigt,
    fehlt,
    entscheidungen: await entscheidungen(),
    offen,
    // shortcut: nur Agenten-Kosten aus loop_events (USD), nicht die Quellen von /api/kosten; bei Bedarf dorthin umstellen.
    kostenUsd: events.length ? kosten : null,
    probleme,
    ceo,
  };
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

/** Alle Markdown-Notizen des Vaults (ohne .git, .obsidian). */
function liesVault(dir: string): Dateien {
  const out: Dateien = {};
  for (const p of readdirSync(dir, { recursive: true, encoding: "utf8" })) if (p.endsWith(".md") && !/^\.|\/\./.test(p)) out[p] = readFileSync(join(dir, p), "utf8");
  return out;
}

/** Klont den Vault, schreibt die Dateien samt Index, Protokoll und Wochen-Check, pusht bei Änderung. Gibt zurück, ob gepusht wurde. */
function pushe(d: Dateien, jetzt: Date): boolean {
  const dir = mkdtempSync(join(tmpdir(), "gedaechtnis-"));
  try {
    git(dir, "clone", "--depth", "1", `https://github.com/${VAULT_REPO}.git`, ".");
    // Einsortieren (SIN-615): Notizen des alten Ordners Eingang/ liegen künftig unter Gespräche/.
    if (existsSync(join(dir, "Eingang"))) {
      mkdirSync(join(dir, "Gespräche"), { recursive: true });
      for (const f of readdirSync(join(dir, "Eingang"))) renameSync(join(dir, "Eingang", f), join(dir, "Gespräche", f));
      rmSync(join(dir, "Eingang"), { recursive: true, force: true });
    }
    const { dateien: alle } = abschliessen(liesVault(dir), d, jetzt, env.WOCHEN_CHECK === "1");
    const treffer = mitGeheimnis(alle);
    if (treffer.length) throw new Error(`Abbruch: Inhalt sieht nach Geheimnis aus in ${treffer.join(", ")}. Nichts geschrieben.`);
    schreibeLokal(dir, alle);
    git(dir, "add", "-A");
    if (!git(dir, "status", "--porcelain").trim()) return false;
    git(dir, "-c", "user.name=gedaechtnis-agent", "-c", "user.email=gedaechtnis-agent@users.noreply.github.com", "commit", "-m", `Stand ${jetzt.toISOString().slice(0, 10)}`);
    git(dir, "push", "origin", "HEAD");
    return true;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Abgeschlossene Wochen-Checks der letzten 14 Tage (SIN-631) als Tage/<Datum>-wochencheck.md; ohne Tabelle oder bei Fehler keine. */
async function wochenChecks(jetzt: Date): Promise<Dateien> {
  try {
    const ab = new Date(jetzt.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
    const zeilen = (await supabase(`leitstand_wochencheck?select=tag,notiz&tag=gte.${ab}`)) as { tag: string; notiz: string }[];
    return Object.fromEntries(zeilen.map((z) => [notizPfad(z.tag), z.notiz]));
  } catch (e) {
    console.warn(`Warnung: Wochen-Checks übersprungen: ${(e as Error).message}`);
    return {};
  }
}

const TAGE_FEHLER = 14;

/** Fehler/ aus roten loop_events (14 Tage, je Tag eine Notiz) und Lehren/ aus wiederholten Gründen und LEHREN.md beider Repos; Quelle ohne Antwort ergibt nur eine Warnung. */
async function lernDateien(jetzt: Date): Promise<Dateien> {
  const out: Dateien = {};
  try {
    // Ein Tag Vorlauf, damit der erste Tag des Fensters vollständig ist.
    const von = new Date(jetzt.getTime() - (TAGE_FEHLER + 1) * 86_400_000).toISOString();
    const zeilen = (await supabase(`loop_events?select=created_at,project,issue,status,grund&status=eq.fehler&created_at=gte.${von}&order=created_at.desc&limit=2000`)) as FehlerZeile[];
    const ab = tagBerlin(new Date(jetzt.getTime() - TAGE_FEHLER * 86_400_000));
    // Lehren nur aus Tagen, für die es eine Fehler-Notiz gibt; sonst zeigt [[Fehler/<Tag>]] des Vorlauftags ins Leere.
    Object.assign(out, fehlerNotizen(zeilen, ab), lehrenAusFehlern(zeilen.filter((z) => tagBerlin(new Date(z.created_at)) >= ab), jetzt));
  } catch (e) {
    console.warn(`Warnung: Fehler-Notizen übersprungen: ${(e as Error).message}`);
  }
  for (const repo of REPOS_ENTSCHEIDUNGEN) {
    for (const pfad of ["LEHREN.md", "docs/autonomy/LEHREN.md"]) {
      const datei = await ghJson<{ content?: string }>(`/repos/${repo}/contents/${pfad}`);
      if (datei?.content) Object.assign(out, lehrenAusDatei(Buffer.from(datei.content, "base64").toString("utf8"), repo, jetzt));
    }
  }
  return out;
}

async function main() {
  const jetzt = new Date();
  const ein = await eingang(jetzt).catch((e: Error): Eingang => {
    console.warn(`Warnung: Eingang übersprungen: ${e.message}`);
    return { issues: [], erledigtStatus: new Map() };
  });
  const d = { ...dateien(await sammle(jetzt)), ...eingangDateien(ein.issues), ...(await wochenChecks(jetzt)), ...(await lernDateien(jetzt)) };
  const treffer = mitGeheimnis(d);
  if (treffer.length) {
    console.error(`Abbruch: Inhalt sieht nach Geheimnis aus in ${treffer.join(", ")}. Nichts geschrieben.`);
    process.exit(1);
  }
  const zugriff = !DRY && (await vaultDa());
  if (!zugriff) {
    const { dateien: alle, befunde } = abschliessen({}, d, jetzt, env.WOCHEN_CHECK === "1");
    const geheim = mitGeheimnis(alle);
    if (geheim.length) {
      console.error(`Abbruch: Inhalt sieht nach Geheimnis aus in ${geheim.join(", ")}. Nichts geschrieben.`);
      process.exit(1);
    }
    schreibeLokal(AUSGABE, alle);
    console.log(`status: braucht_sinan\nTrockenlauf${DRY ? "" : ` (kein Zugriff auf ${VAULT_REPO}, SIN-540 offen)`}: ${Object.keys(alle).length} Dateien nach ${AUSGABE}/${befunde ? `, Wochen-Check: ${befunde.length} Befunde` : ""}.`);
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
