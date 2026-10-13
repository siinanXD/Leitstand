/**
 * Gedächtnis-Agent (SIN-541). Aufruf aus gedaechtnis.yml (Vorlage: docs/gedaechtnis/gedaechtnis.yml.vorlage):
 *
 *   npx tsx scripts/gedaechtnis/schreiben.ts
 *
 * Liest loop_snapshot und loop_events (Supabase), gemergte PRs der letzten 24 h und docs/decisions/ beider Repos (GitHub)
 * und schreibt Markdown für den privaten Obsidian-Vault siinanXD/gedaechtnis. Pusht nur, wenn sich etwas geändert hat.
 * Kein KI-Aufruf, keine Rohdaten oder Traces. Legt nie ein öffentliches Repo an und ändert nie Token-Rechte.
 *
 * Env: GH_TOKEN (AGENT_WORKFLOW_TOKEN), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Ohne Zugriff auf das Repo (SIN-540 offen) oder mit DRY_RUN=1: Trockenlauf, Ausgabe in GEDAECHTNIS_AUSGABE (Standard gedaechtnis-ausgabe/),
 * Status `braucht_sinan`, Lauf bleibt grün.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { dateien, ereignisZeile, mitGeheimnis, VAULT_REPO, type Dateien, type Eingabe, type Entscheidung, type OffenerPunkt, type Pr } from "../../src/lib/gedaechtnis/gedaechtnis";
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
  const probleme: string[] = [];
  try {
    snapshot = parseSnapshot(await supabase("loop_snapshot?select=*&limit=200"));
    events = parseEvents(await supabase(`loop_events?select=*&created_at=gte.${seit.toISOString()}&order=created_at.desc&limit=1000`));
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
  const d = dateien(await sammle(jetzt));
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
