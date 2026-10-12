/**
 * Lern-Agent (SIN-512). Aufruf: npx tsx scripts/lernen/lernen.ts [--stunden 24]
 * Liest loop_events der letzten Stunden und Reparatur-Kommentare, schreibt
 *   docs/autonomy/berichte/lernen-<Datum>.json   (fester Bericht)
 *   docs/autonomy/lehren/<thema>.md              (eine Datei je Thema) und INDEX.md
 * Rein regelbasiert, keine Modellkosten. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GH_TOKEN, GITHUB_REPOSITORY, DRY_RUN=1.
 * Ohne Supabase-Secrets bricht das Skript mit Hinweis ab, nichts wird erfunden.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { erstelleBericht, LEHREN_ORDNER, lehreDatei, leseLehre, lehrenIndex, type Fehlerhinweis, type LernEreignis } from "../../src/lib/lernen/lernen";

const env = process.env;
const repo = env.GITHUB_REPOSITORY ?? "siinanXD/leitstand";
const stunden = Number(process.argv[process.argv.indexOf("--stunden") + 1]) || 24;
const jetzt = new Date();
const seit = new Date(jetzt.getTime() - stunden * 3600_000).toISOString();

async function ereignisse(): Promise<LernEreignis[]> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt");
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events?project=eq.leitstand&created_at=gte.${seit}&select=created_at,step,status,issue,pr,agent,cost&order=created_at`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error(`loop_events: ${res.status} ${await res.text()}`);
  return (await res.json()) as LernEreignis[];
}

/** Reparatur-Kommentare des Loops („Der Check build ist rot“) als Fehlerhinweise. */
async function reparaturHinweise(): Promise<Fehlerhinweis[]> {
  if (!env.GH_TOKEN) return [];
  const res = await fetch(`https://api.github.com/repos/${repo}/issues/comments?since=${seit}&per_page=100`, {
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return [];
  const kommentare = (await res.json()) as { body: string; html_url: string }[];
  return kommentare
    .filter((k) => /Der Check build ist rot/.test(k.body))
    .map((k) => ({ thema: "build rot nach PR", text: "Der Check build war auf einem Claude-PR rot und brauchte eine Reparaturrunde.", quelle: k.html_url }));
}

async function main() {
  const bericht = erstelleBericht(await ereignisse(), await reparaturHinweise(), jetzt, stunden);
  if (env.DRY_RUN === "1") return console.log(JSON.stringify(bericht, null, 2));
  mkdirSync("docs/autonomy/berichte", { recursive: true });
  mkdirSync(LEHREN_ORDNER, { recursive: true });
  writeFileSync(`docs/autonomy/berichte/lernen-${jetzt.toISOString().slice(0, 10)}.json`, `${JSON.stringify(bericht, null, 2)}\n`);
  const vorhanden = new Set(readdirSync(LEHREN_ORDNER));
  for (const f of bericht.fehler) {
    const { pfad, inhalt } = lehreDatei(f, []);
    if (vorhanden.has(pfad.split("/").pop()!)) continue; // bestehende Lehren nie überschreiben
    writeFileSync(pfad, inhalt);
    console.log(`Neue Lehre: ${pfad}`);
  }
  const lehren = readdirSync(LEHREN_ORDNER)
    .filter((d) => d.endsWith(".md") && d !== "INDEX.md")
    .map((d) => leseLehre(`${LEHREN_ORDNER}/${d}`, readFileSync(`${LEHREN_ORDNER}/${d}`, "utf8")));
  writeFileSync(`${LEHREN_ORDNER}/INDEX.md`, lehrenIndex(lehren));
  console.log(`Bericht: ${bericht.fehler.length} wiederkehrende Fehler, ${bericht.skillVorschlaege.length} Skill-Vorschläge.`);
}

main().catch((e: Error) => {
  console.error(`::error::${e.message}`);
  process.exit(1);
});
