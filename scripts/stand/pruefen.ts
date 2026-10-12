/**
 * Stand-Agent (SIN-508). Aufruf aus stand.yml (Vorlage: docs/stand/stand.yml.vorlage):
 *
 *   npx tsx scripts/stand/pruefen.ts
 *
 * Liest docs/stand.json, prüft die Themen mit festen Regeln (src/lib/stand/stand.ts) und schreibt stand-bericht.json
 * (ok / veraltet / fehlt, je mit Link). Bei Abweichung: Ereignis in loop_events (Agent betrieb, Schritt stand).
 * Keine KI: nur Vergleiche. Quellen, die nicht erreichbar sind, erscheinen als „fehlt“, nie als „ok“.
 *
 * Env (alle optional, was fehlt, wird als „fehlt“ gemeldet):
 *   GH_TOKEN                      gemergte PRs lesen
 *   LINEAR_API_KEY                Issue-Status lesen
 *   FIGMA_ACCESS_TOKEN            Frames in Figma prüfen
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   loop_events lesen und schreiben, Content-Zahlen
 *   SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN   schema_migrations lesen (Management-API)
 * DRY_RUN=1: kein Ereignis schreiben. STAND_BERICHT: Ausgabedatei (Standard stand-bericht.json).
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  bericht,
  ereignisZeile,
  envVariablen,
  pruefeContent,
  pruefeDesign,
  pruefeDoku,
  pruefeLinearGithub,
  pruefeLoopEvents,
  pruefeMigrationen,
  type Befund,
  type IssueZeile,
  type PrZeile,
  type StandConfig,
} from "../../src/lib/stand/stand";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const lies = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : null);

function dateien(wurzel: string, treffer: (p: string) => boolean): string[] {
  if (!existsSync(wurzel)) return [];
  const out: string[] = [];
  for (const name of readdirSync(wurzel)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(wurzel, name);
    if (statSync(p).isDirectory()) out.push(...dateien(p, treffer));
    else if (treffer(p)) out.push(p);
  }
  return out.sort();
}

async function json<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${new URL(url).host}: ${res.status}`);
  return (await res.json()) as T;
}

const supabaseKopf = () => ({ apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? "", Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` });
const hatSupabase = () => Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

/** Ein Netz-Schritt darf fehlschlagen; dann steht „fehlt“ im Bericht. */
async function versuche<T>(thema: Befund["thema"], pruefung: string, f: () => Promise<T>): Promise<T | Befund> {
  try {
    return await f();
  } catch (e) {
    return { thema, pruefung, status: "fehlt", text: `Nicht geprüft: ${(e as Error).message}` };
  }
}
const istBefund = (x: unknown): x is Befund => typeof x === "object" && x !== null && "pruefung" in x && "status" in x;

async function figmaIds(datei: string): Promise<Set<string> | null> {
  if (!env.FIGMA_ACCESS_TOKEN) return null;
  const d = await json<{ document: { children: { children?: { id: string }[] }[] } }>(`https://api.figma.com/v1/files/${datei}?depth=2`, { headers: { "X-Figma-Token": env.FIGMA_ACCESS_TOKEN } });
  return new Set(d.document.children.flatMap((seite) => (seite.children ?? []).map((k) => k.id)));
}

async function angewendeteMigrationen(): Promise<string[] | null> {
  if (!env.SUPABASE_PROJECT_REF || !env.SUPABASE_ACCESS_TOKEN) return null;
  const zeilen = await json<{ version: string }[]>(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "select version from supabase_migrations.schema_migrations" }),
  });
  return zeilen.map((z) => z.version);
}

async function gemergtePrs(repo: string): Promise<PrZeile[]> {
  if (!env.GH_TOKEN) throw new Error("GH_TOKEN fehlt");
  const prs = await json<{ number: number; title: string; merged_at: string | null; html_url: string }[]>(`https://api.github.com/repos/${repo}/pulls?state=closed&per_page=100&sort=updated&direction=desc`, {
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json" },
  });
  return prs
    .filter((p) => p.merged_at)
    .sort((a, b) => Date.parse(a.merged_at ?? "") - Date.parse(b.merged_at ?? ""))
    .map((p) => ({ nummer: p.number, titel: p.title, gemergt: true, url: p.html_url }));
}

async function linearIssues(ids: string[]): Promise<IssueZeile[]> {
  if (!env.LINEAR_API_KEY) throw new Error("LINEAR_API_KEY fehlt");
  const out: IssueZeile[] = [];
  for (const id of ids) {
    const d = await json<{ data?: { issue: { identifier: string; url: string; state: { type: string } } | null } }>("https://api.linear.app/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: env.LINEAR_API_KEY },
      body: JSON.stringify({ query: "query($id: String!) { issue(id: $id) { identifier url state { type } } }", variables: { id } }),
    });
    const i = d.data?.issue;
    if (i) out.push({ id: i.identifier, statusTyp: i.state.type, url: i.url });
  }
  return out;
}

async function loopEvents(): Promise<{ project: string | null; step: string | null }[]> {
  if (!hatSupabase()) throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt");
  const ab = new Date(Date.now() - 7 * 86_400_000).toISOString();
  return json(`${env.SUPABASE_URL}/rest/v1/loop_events?select=project,step&created_at=gte.${ab}&limit=5000`, { headers: supabaseKopf() });
}

async function zaehle(tabelle: string): Promise<number> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${encodeURIComponent(tabelle)}?select=*`, { method: "HEAD", headers: { ...supabaseKopf(), Prefer: "count=exact" } });
  const m = /\/(\d+)$/.exec(res.headers.get("content-range") ?? "");
  if (!res.ok || !m) throw new Error(`Zählung ${tabelle}: ${res.status}`);
  return Number(m[1]);
}

async function main() {
  const cfg = JSON.parse(readFileSync("docs/stand.json", "utf8")) as StandConfig;
  const jetzt = new Date();
  const befunde: Befund[] = [];
  const link = (id: string) => cfg.themen.find((t) => t.id === id)?.link;

  if (cfg.design) {
    const ids = await versuche("design", "frame-in-figma", () => figmaIds(cfg.design!.datei));
    if (istBefund(ids)) befunde.push(ids);
    else if (ids === null) befunde.push({ thema: "design", pruefung: "frame-in-figma", status: "fehlt", text: "Nicht geprüft: FIGMA_ACCESS_TOKEN fehlt.", link: link("design") });
    const seiten = dateien("src/app", (p) => p.endsWith("/page.tsx")).map((p) => p.replace(/\\/g, "/"));
    befunde.push(...pruefeDesign(cfg.design.frames, lies(cfg.design.agentsDatei) ?? "", seiten, link("design") ?? "", istBefund(ids) || ids === null ? undefined : ids));
  }

  if (cfg.datenbank) {
    const migs = dateien(cfg.datenbank.migrationen, (p) => p.endsWith(".sql"));
    const angewendet = await versuche("datenbank", "migrationen", angewendeteMigrationen);
    if (migs.length === 0 && !existsSync(cfg.datenbank.migrationen)) befunde.push({ thema: "datenbank", pruefung: "migrationen", status: "fehlt", text: `Verzeichnis ${cfg.datenbank.migrationen} fehlt.` });
    else if (istBefund(angewendet)) befunde.push(angewendet);
    else befunde.push(...pruefeMigrationen(migs, angewendet, link("datenbank")));
  }

  if (cfg.doku) {
    const code = cfg.doku.codeVerzeichnisse.flatMap((d) => dateien(d, (p) => /\.(ts|tsx)$/.test(p))).map((p) => readFileSync(p, "utf8")).join("\n");
    const skripte = Object.keys((JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> }).scripts ?? {});
    befunde.push(...pruefeDoku(skripte, lies("README.md") ?? "", envVariablen(code), lies(".env.example") ?? "", lies("docs/LANDKARTE.md")));
  }

  if (cfg.content) {
    const c = cfg.content;
    const r = await versuche("content", "einheiten-dateien", async () => {
      if (!hatSupabase()) throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt");
      const einheiten = await zaehle(c.einheitenTabelle);
      const maps = await json<{ name: string; status: string }[]>(`${env.SUPABASE_URL}/rest/v1/${encodeURIComponent(c.mapsTabelle)}?select=name,status`, { headers: supabaseKopf() });
      return { einheiten, maps };
    });
    if (istBefund(r)) befunde.push(r);
    else {
      const aufDisk = dateien(c.dateien, (p) => p.endsWith(".json")).reduce((n, p) => {
        const j = JSON.parse(readFileSync(p, "utf8")) as unknown;
        return n + (Array.isArray(j) ? j.length : 1);
      }, 0);
      // Die Landkarte (Figma) wird noch nicht gelesen: ehrlich als „fehlt“ melden.
      befunde.push(...pruefeContent(r, aufDisk, null, [], link("content")));
    }
  }

  const prs = await versuche("linear", "merge-status", () => gemergtePrs(cfg.repo));
  if (istBefund(prs)) befunde.push(prs);
  else {
    const ids = [...new Set(prs.flatMap((p) => p.titel.match(/\bSIN-\d+\b/g) ?? []))];
    const issues = await versuche("linear", "merge-status", () => linearIssues(ids));
    befunde.push(...(istBefund(issues) ? [issues] : pruefeLinearGithub(prs, issues)));
  }

  if (cfg.leitstand) {
    const ev = await versuche("leitstand", "namen", loopEvents);
    befunde.push(...(istBefund(ev) ? [ev] : pruefeLoopEvents(ev, cfg.leitstand.projekte, cfg.leitstand.schritte)));
  }

  const b = bericht(cfg.projekt, befunde, jetzt);
  writeFileSync(env.STAND_BERICHT ?? "stand-bericht.json", JSON.stringify(b, null, 2) + "\n");
  for (const x of befunde.filter((x) => x.status !== "ok")) console.log(`${x.status.toUpperCase()} [${x.thema}/${x.pruefung}] ${x.text}${x.link ? ` ${x.link}` : ""}`);
  console.log(`Stand ${cfg.projekt}: ok ${b.zusammenfassung.ok}, veraltet ${b.zusammenfassung.veraltet}, fehlt ${b.zusammenfassung.fehlt}`);

  if (DRY) return;
  if (!hatSupabase()) {
    console.log("::warning::Kein loop_event (stand): SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt.");
    return;
  }
  const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${cfg.repo}/actions/runs/${env.GITHUB_RUN_ID}` : null;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events`, {
    method: "POST",
    headers: { ...supabaseKopf(), "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(ereignisZeile(b, env.GITHUB_RUN_ID ?? null, runUrl)),
  }).catch((e: Error) => ({ ok: false, status: 0, text: async () => e.message }));
  if (!res.ok) console.log(`::warning::loop_event nicht geschrieben: ${res.status} ${await res.text()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
