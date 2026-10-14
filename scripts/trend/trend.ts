/**
 * Trend-Radar 2 (SIN-575). Aufruf aus trend.yml (.github/workflows/trend.yml):
 *
 *   TREND_MODUS=messen npx tsx scripts/trend/trend.ts   # täglich: nur Sternzuwachs, ohne Modell
 *   TREND_MODUS=woche  npx tsx scripts/trend/trend.ts   # sonntags: messen, mit Haiku bewerten, Issues, Kachel
 *
 * Misst GitHub (Themen aus src/lib/trend/trend.ts), Hugging Face (Modelle, Spaces) und die Releases der Changelog-Repos,
 * schreibt den Stand nach docs/markt/trends.json (committet der Workflow) und meldet an loop_events (Kachel „Trends“).
 * Bewertung nur mit Haiku per API und dem Deckel von 0,50 € je Lauf. Fehlt der Schlüssel, der Preis oder ist der Deckel erreicht,
 * bleibt der Rest unbewertet und der Lauf grün: er hängt nie am Claude-Kontingent.
 *
 * Env: GH_TOKEN (Suche, 30 statt 10 Anfragen je Minute), ANTHROPIC_API_KEY, VORARBEITER_PREIS_EIN_USD, VORARBEITER_PREIS_AUS_USD, KOSTEN_USD_EUR,
 * LINEAR_API_KEY, TREND_LINEAR_PROJEKT (Projekt der Issues, Standard „Leitstand“), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (optional).
 * DRY_RUN=1: nur Log, keine Datei, kein Issue, kein Ereignis (Modellaufrufe laufen trotzdem, wenn der Schlüssel da ist).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { aufrufKosten, bewertungsPrompt, CHANGELOGS, DECKEL_EUR, ereignisZeile, issueFuer, istKandidat, kachelPayload, aktivSeit, leseFund, mische, MODELL, SCHRITT, SCHRITT_MESSUNG, STERNE_NEU, TAGE_NEU, THEMEN, type Fund, type Messung, type Stand } from "../../src/lib/trend/trend";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const PFAD = "docs/markt/trends.json";
const jetzt = new Date();
const heute = jetzt.toISOString().slice(0, 10);
const vorTagen = (n: number) => new Date(jetzt.getTime() - n * 86_400_000).toISOString().slice(0, 10);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function json(url: string, kopf: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: "application/json", ...kopf }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${new URL(url).host}${new URL(url).pathname}: ${res.status}`);
  return res.json();
}

const ghKopf = { "X-GitHub-Api-Version": "2022-11-28", ...(env.GH_TOKEN ? { Authorization: `Bearer ${env.GH_TOKEN}` } : {}) };
const ghJson = (pfad: string) => json(`https://api.github.com${pfad}`, ghKopf);

type Repo = { full_name?: string; html_url?: string; stargazers_count?: number; license?: { spdx_id?: string } | null; pushed_at?: string; created_at?: string; description?: string | null };
const ausRepo = (r: Repo): Messung | null =>
  r.full_name && r.html_url?.startsWith("https://") && typeof r.stargazers_count === "number"
    ? { id: `github:${r.full_name}`, quelle: "github", was: r.full_name, url: r.html_url, lizenz: r.license?.spdx_id && r.license.spdx_id !== "NOASSERTION" ? r.license.spdx_id : "unbekannt", sterne: r.stargazers_count, aktiv: r.pushed_at ? aktivSeit(r.pushed_at, jetzt) : false, angelegt: r.created_at?.slice(0, 10) ?? null, beschreibung: r.description ?? "" }
    : null;

async function github(): Promise<Messung[]> {
  const out = new Map<string, Messung>();
  for (const t of THEMEN) {
    // Neu (> 1.000 Sterne in 60 Tagen) und breit (aktiv diese Woche, für den Sternzuwachs gegen `basis`).
    for (const q of [`topic:${t} stars:>${STERNE_NEU} created:>${vorTagen(TAGE_NEU)}`, `topic:${t} stars:>${STERNE_NEU} pushed:>${vorTagen(7)}`]) {
      const d = (await ghJson(`/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=20`)) as { items?: Repo[] };
      for (const r of d.items ?? []) {
        const m = ausRepo(r);
        if (m) out.set(m.id, m);
      }
      await pause(env.GH_TOKEN ? 2_100 : 6_100);
    }
  }
  return [...out.values()];
}

type Hf = { id?: string; likes?: number; tags?: string[]; lastModified?: string; cardData?: { license?: string } };
async function huggingface(): Promise<Messung[]> {
  const out: Messung[] = [];
  for (const art of ["models", "spaces"] as const) {
    // shortcut: `sort=trendingScore` (Doku-Name); Papers daily fehlen, sie haben weder Lizenz noch Sterne. Bei Bedarf ergänzen.
    for (const x of (await json(`https://huggingface.co/api/${art}?sort=trendingScore&limit=10`)) as Hf[]) {
      if (!x.id) continue;
      const lizenz = x.tags?.find((t) => t.startsWith("license:"))?.slice(8) ?? x.cardData?.license ?? "unbekannt";
      out.push({ id: `hf:${art}:${x.id}`, quelle: "huggingface", was: x.id, url: `https://huggingface.co/${art === "spaces" ? "spaces/" : ""}${x.id}`, lizenz, sterne: x.likes ?? 0, aktiv: x.lastModified ? aktivSeit(x.lastModified, jetzt) : false, angelegt: null, beschreibung: `Hugging Face ${art === "models" ? "Modell" : "Space"}, trendet` });
    }
  }
  return out;
}

async function changelogs(): Promise<Messung[]> {
  const out: Messung[] = [];
  for (const repo of CHANGELOGS) {
    const [rel] = (await ghJson(`/repos/${repo}/releases?per_page=1`)) as { tag_name?: string; html_url?: string; name?: string | null; body?: string | null; published_at?: string }[];
    if (!rel?.tag_name || !rel.html_url?.startsWith("https://") || !rel.published_at || Date.parse(rel.published_at) < jetzt.getTime() - 7 * 86_400_000) continue;
    const m = ausRepo((await ghJson(`/repos/${repo}`)) as Repo);
    if (m) out.push({ ...m, id: `changelog:${repo}@${rel.tag_name}`, quelle: "changelog", was: `${repo} ${rel.tag_name}`, url: rel.html_url, beschreibung: `Neues Release: ${rel.name ?? rel.tag_name}. ${(rel.body ?? "").slice(0, 400)}` });
  }
  return out;
}

/** Eine Quelle darf ausfallen (Rate-Limit, Netz); nur wenn alle ausfallen, ist die Messung gescheitert. */
async function messen(): Promise<Messung[]> {
  const quellen = { github, huggingface, changelogs };
  const alle: Messung[] = [];
  let fehler = 0;
  for (const [name, f] of Object.entries(quellen)) {
    try {
      alle.push(...(await f()));
    } catch (e) {
      fehler++;
      console.warn(`Warnung: ${name} nicht gemessen (${e instanceof Error ? e.message : e})`);
    }
  }
  if (fehler === Object.keys(quellen).length) throw new Error("Keine Quelle erreichbar, nichts gemessen");
  return alle;
}

function lies(): Stand {
  const leer: Stand = { stand: heute, basis: {}, kandidaten: [], funde: [] };
  if (!existsSync(PFAD)) return leer;
  const o = JSON.parse(readFileSync(PFAD, "utf8")) as Partial<Stand>;
  return { ...leer, basis: o.basis ?? {}, kandidaten: o.kandidaten ?? [], funde: o.funde ?? [] };
}

/** Haiku bewertet; Kosten laufen mit, bei Deckel oder Fehler bleibt der Rest unbewertet. */
async function bewerten(kandidaten: Messung[], basis: Record<string, number>): Promise<{ funde: Fund[]; eur: number }> {
  const preis = { einProMio: Number(env.VORARBEITER_PREIS_EIN_USD), ausProMio: Number(env.VORARBEITER_PREIS_AUS_USD) };
  const kurs = Number((env.KOSTEN_USD_EUR ?? "").replace(",", "."));
  if (!env.ANTHROPIC_API_KEY || !(preis.einProMio > 0) || !(preis.ausProMio > 0) || !(kurs > 0)) {
    console.warn("Bewertung übersprungen: ANTHROPIC_API_KEY, Preise oder KOSTEN_USD_EUR fehlen.");
    return { funde: [], eur: 0 };
  }
  const funde: Fund[] = [];
  let eur = 0;
  for (const m of kandidaten) {
    if (eur >= DECKEL_EUR) {
      console.warn(`Deckel von ${DECKEL_EUR} € erreicht, Rest bleibt für nächste Woche.`);
      break;
    }
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: MODELL, max_tokens: 400, messages: [{ role: "user", content: bewertungsPrompt(m) }] }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`Modell: ${res.status}`);
      const a = (await res.json()) as { content?: { text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
      eur += aufrufKosten(a.usage?.input_tokens ?? 0, a.usage?.output_tokens ?? 0, preis, kurs);
      const t = a.content?.[0]?.text ?? "";
      // shortcut: erstes JSON-Objekt der Antwort, bei Mischtext auf strukturierte Ausgabe umstellen.
      const f = leseFund(JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)), m, basis[m.id], heute);
      if (f) funde.push(f);
      else console.warn(`Antwort zu ${m.id} ungültig, übersprungen.`);
    } catch (e) {
      console.warn(`Warnung: ${m.id} nicht bewertet (${e instanceof Error ? e.message : e})`);
    }
  }
  return { funde, eur: Math.round(eur * 1e4) / 1e4 };
}

async function linear<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { "Content-Type": "application/json", Authorization: env.LINEAR_API_KEY ?? "" }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30_000) });
  const j = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (!res.ok || j.errors || !j.data) throw new Error(`Linear: ${j.errors?.map((e) => e.message).join("; ") ?? res.status}`);
  return j.data;
}

type Projekt = { id: string; teams: { nodes: { id: string; states: { nodes: { id: string; name: string }[] }; labels: { nodes: { id: string; name: string }[] } }[] }; projectMilestones: { nodes: { id: string; name: string }[] }; issues: { nodes: { title: string }[] } };

/** `version` → Issue mit Label `idee`, Meilenstein „v2 Ideen“, Backlog. `jetzt` → dasselbe plus Label `sinan` und „Dringend?“ im Titel: Sinan entscheidet. */
async function issuesAnlegen(funde: Fund[]): Promise<number> {
  const liste = funde.filter((f) => f.empfehlung === "jetzt" || f.empfehlung === "version");
  if (liste.length === 0) return 0;
  if (!env.LINEAR_API_KEY) return console.warn("Issues nicht angelegt: LINEAR_API_KEY fehlt."), 0;
  const name = env.TREND_LINEAR_PROJEKT ?? "Leitstand";
  const d = await linear<{ projects: { nodes: Projekt[] } }>(
    `query($n: String!) { projects(filter: { name: { eq: $n } }, first: 1) { nodes { id teams { nodes { id states { nodes { id name } } labels(first: 250) { nodes { id name } } } } projectMilestones { nodes { id name } } issues(first: 250) { nodes { title } } } } }`,
    { n: name },
  );
  const p = d.projects.nodes[0];
  const team = p?.teams.nodes[0];
  const label = (n: string) => team?.labels.nodes.find((l) => l.name.toLowerCase() === n)?.id;
  const backlog = team?.states.nodes.find((s) => s.name === "Backlog")?.id;
  const meilenstein = p?.projectMilestones.nodes.find((m) => m.name === "v2 Ideen")?.id;
  if (!p || !team || !backlog || !meilenstein || !label("idee")) throw new Error(`Projekt „${name}“, Backlog, Meilenstein „v2 Ideen“ oder Label „idee“ in Linear nicht gefunden`);
  let n = 0;
  for (const f of liste) {
    const i = issueFuer(f);
    if (p.issues.nodes.some((x) => x.title === i.titel)) continue; // Wiederholung legt nichts doppelt an
    const labelIds = [label("idee"), ...(i.vorschlagDringend ? [label("sinan")] : [])].filter((x): x is string => Boolean(x));
    if (DRY) console.log(`[trocken] Issue: ${i.titel}`);
    else await linear(`mutation($i: IssueCreateInput!) { issueCreate(input: $i) { success } }`, { i: { teamId: team.id, projectId: p.id, projectMilestoneId: meilenstein, stateId: backlog, labelIds, title: i.titel, description: i.beschreibung } });
    n++;
  }
  return n;
}

async function ereignis(schritt: string, ok: boolean, payload: unknown): Promise<void> {
  if (DRY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return console.warn("Ereignis nicht geschrieben (trocken oder Supabase-Variablen fehlen)");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(ereignisZeile(schritt, ok, payload)) });
  if (!res.ok) throw new Error(`Supabase loop_events: ${res.status}`);
}

function speichern(s: Stand) {
  if (DRY) return console.log(`[trocken] ${PFAD}: ${s.funde.length} Funde, ${s.kandidaten.length} Kandidaten`);
  writeFileSync(PFAD, `${JSON.stringify(s, null, 2)}\n`);
}

async function main() {
  const modus = env.TREND_MODUS ?? "messen";
  if (modus !== "messen" && modus !== "woche") throw new Error(`TREND_MODUS ungültig: ${modus}`);
  const stand = lies();
  const gemessen = await messen();
  const kandidaten = gemessen.filter((m) => istKandidat(m, stand.basis[m.id], jetzt));
  console.log(`${gemessen.length} gemessen, ${kandidaten.length} Kandidaten (${modus}).`);

  if (modus === "messen") {
    speichern({ ...stand, stand: heute, kandidaten: kandidaten.map((m) => m.id) });
    return ereignis(SCHRITT_MESSUNG, true, { gemessen: gemessen.length, kandidaten: kandidaten.length });
  }

  // Woche: nur bewerten, was noch nicht bewertet ist; die meisten Sterne zuerst, damit der Deckel das Wichtige trifft.
  const neu = kandidaten.filter((m) => !stand.funde.some((f) => f.id === m.id)).sort((a, b) => b.sterne - a.sterne).slice(0, 30);
  const { funde: bewertet, eur } = await bewerten(neu, stand.basis);
  const funde = mische(stand.funde, bewertet);
  const basis = Object.fromEntries(gemessen.filter((m) => m.quelle === "github").map((m) => [m.id, m.sterne]));
  speichern({ stand: heute, basis, kandidaten: kandidaten.map((m) => m.id), funde });
  let issues = 0;
  try {
    issues = await issuesAnlegen(bewertet);
  } catch (e) {
    console.warn(`Warnung: Issues nicht angelegt (${e instanceof Error ? e.message : e})`);
  }
  await ereignis(SCHRITT, true, { ...kachelPayload(funde), bewertet: bewertet.length, kosten_eur: eur, issues });
  console.log(`${bewertet.length} bewertet (${eur} €), ${issues} Issues, ${funde.length} Funde im Stand.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
