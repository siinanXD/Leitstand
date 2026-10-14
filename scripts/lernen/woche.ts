/**
 * Selbstlern-Schleife (SIN-576). Aufruf montags 05:30 aus lernen.yml (.github/workflows/lernen.yml):
 *
 *   npx tsx scripts/lernen/woche.ts
 *
 * 1. Misst die letzten 7 Tage je Produkt (GitHub-PRs, loop_events), ohne Modell.
 * 2. Nachmessen: war in der Vorwoche eine Änderung, vergleicht es den Wert. Besser → BEHALTEN.md, sonst Zeile zurück und VERWORFEN.md.
 * 3. Eine neue Regelzeile (Haiku, Deckel 1 €) gegen den schlechtesten Wert, nur wenn nichts verworfen wurde (Revert ist die Änderung der Woche).
 * Schreibt docs/lernen/woche-<KW>.json, BEHALTEN.md, VERWORFEN.md und die geänderte Regeldatei; der Workflow öffnet den PR.
 *
 * Env: GH_TOKEN, ANTHROPIC_API_KEY, VORARBEITER_PREIS_EIN_USD, VORARBEITER_PREIS_AUS_USD, KOSTEN_USD_EUR, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (optional),
 * LERNEN_REPOS (Standard „siinanXD/Leitstand,siinanXD/Content-Agent-Lernapp“). DRY_RUN=1: nur Log, keine Datei, kein Ereignis.
 * Ohne Schlüssel oder Preis bleibt es bei der Messung und der Lauf grün.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { aufrufKosten, SPUR_C_MODELL } from "../../src/lib/vorarbeiter/vorarbeiter";
import { DECKEL_EUR, ereignisZeile, kachelPayload, kalenderwoche, leseVorschlag, messe, schlechtester, urteil, vorschlagsPrompt, zeileEinfuegen, zeileEntfernen, type Ereignis, type Nachmessung, type Pr, type Vorschlag, type Woche } from "../../src/lib/lernen/schleife";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const ORDNER = "docs/lernen";
const TAGE = 7;
const jetzt = new Date();
const kw = kalenderwoche(jetzt);
const vorKw = kalenderwoche(new Date(jetzt.getTime() - TAGE * 86_400_000));
const tag = (d: Date) => d.toISOString().slice(0, 10);
const seit = new Date(jetzt.getTime() - TAGE * 86_400_000);
const repos = (env.LERNEN_REPOS ?? "siinanXD/Leitstand,siinanXD/Content-Agent-Lernapp").split(",").map((r) => r.trim()).filter(Boolean);
const lesen = (pfad: string) => (existsSync(pfad) ? readFileSync(pfad, "utf8") : "");

async function gh(pfad: string): Promise<unknown> {
  const res = await fetch(`https://api.github.com${pfad}`, { headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(env.GH_TOKEN ? { Authorization: `Bearer ${env.GH_TOKEN}` } : {}) }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`GitHub ${pfad}: ${res.status}`);
  return res.json();
}

/** Gemergte PRs der Woche. shortcut: eine Seite mit 100, bei mehr als 100 Merges je Woche paginieren. */
async function prs(repo: string): Promise<Pr[]> {
  const liste = (await gh(`/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100`)) as { title: string; merged_at: string | null; labels: { name: string }[] }[];
  return liste.filter((p) => p.merged_at && Date.parse(p.merged_at) >= seit.getTime()).map((p) => ({ titel: p.title, labels: p.labels.map((l) => l.name), gemergt: p.merged_at }));
}

async function ereignisse(projekt: string): Promise<Ereignis[]> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return [];
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events?project=eq.${projekt}&created_at=gte.${seit.toISOString()}&select=cost`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } });
  if (!res.ok) throw new Error(`loop_events: ${res.status}`);
  return (await res.json()) as Ereignis[];
}

/** Die zehn jüngsten roten Läufe (Titel der Lehren-Dateien genügt dem Vorschlag nicht; hier die Reparatur-Kommentare). */
async function roteLaeufe(repo: string): Promise<string[]> {
  if (!env.GH_TOKEN) return [];
  const k = (await gh(`/repos/${repo}/issues/comments?since=${seit.toISOString()}&per_page=100`)) as { body: string }[];
  return k.filter((c) => /Der Check build ist rot/.test(c.body)).slice(-10).map((c) => c.body.replace(/\s+/g, " ").slice(0, 200));
}

async function vorschlagen(ziel: NonNullable<ReturnType<typeof schlechtester>>, vorwoche: Woche | null, verworfen: string[]): Promise<Vorschlag | null> {
  const preis = { einProMio: Number(env.VORARBEITER_PREIS_EIN_USD), ausProMio: Number(env.VORARBEITER_PREIS_AUS_USD) };
  const kurs = Number((env.KOSTEN_USD_EUR ?? "").replace(",", "."));
  if (!env.ANTHROPIC_API_KEY || !(preis.einProMio > 0) || !(preis.ausProMio > 0) || !(kurs > 0)) {
    console.warn("Kein Vorschlag: ANTHROPIC_API_KEY, Preise oder KOSTEN_USD_EUR fehlen.");
    return null;
  }
  const werte = vorwoche?.produkte.find((p) => p.produkt === ziel.produkt)?.werte ?? null;
  const rote = await roteLaeufe(repos[0]).catch(() => []);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: SPUR_C_MODELL, max_tokens: 500, messages: [{ role: "user", content: vorschlagsPrompt(ziel, werte, lesen("docs/autonomy/LEHREN.md"), rote, verworfen) }] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Modell: ${res.status}`);
  const a = (await res.json()) as { content?: { text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
  const eur = aufrufKosten(a.usage?.input_tokens ?? 0, a.usage?.output_tokens ?? 0, preis, kurs);
  if (eur > DECKEL_EUR) console.warn(`Warnung: ${eur} € über dem Deckel von ${DECKEL_EUR} €.`);
  const t = a.content?.[0]?.text ?? "";
  // shortcut: erstes JSON-Objekt der Antwort, bei Mischtext auf strukturierte Ausgabe umstellen.
  const v = leseVorschlag(JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)), ziel, verworfen, eur);
  if (!v) console.warn("Antwort ungültig oder schon verworfen, kein Vorschlag diese Woche.");
  return v;
}

function schreiben(pfad: string, inhalt: string) {
  if (DRY) return console.log(`[trocken] ${pfad}`);
  writeFileSync(pfad, inhalt);
}

async function main() {
  const produkte: Woche["produkte"] = [];
  for (const repo of repos) {
    const liste = await prs(repo);
    const projekt = repo.split("/")[1].toLowerCase().includes("lern") ? "lernapp" : "leitstand";
    produkte.push({ produkt: projekt, repo, prs: liste.length, werte: messe(liste, await ereignisse(projekt).catch(() => []), TAGE) });
  }

  // Nachmessen: Vorschlag der Vorwoche gegen den Wert dieser Woche.
  const vorPfad = `${ORDNER}/woche-${vorKw}.json`;
  const vorwoche = existsSync(vorPfad) ? (JSON.parse(readFileSync(vorPfad, "utf8")) as Woche) : null;
  let nachmessung: Nachmessung | null = null;
  const alt = vorwoche?.vorschlag;
  if (alt) {
    const nachher = produkte.find((p) => p.produkt === alt.produkt)?.werte[alt.wert] ?? null;
    const ergebnis = urteil(alt.wert, alt.vorher, nachher);
    nachmessung = { kw_vorschlag: vorKw, produkt: alt.produkt, wert: alt.wert, vorher: alt.vorher, nachher, ergebnis };
    const zeileMd = `- ${vorKw} · ${alt.produkt} · ${alt.wert}: ${alt.vorher} → ${nachher ?? "?"} · ${alt.zeile.slice(2)} (${alt.datei})\n`;
    if (ergebnis === "behalten" && !DRY) appendFileSync(`${ORDNER}/BEHALTEN.md`, zeileMd);
    if (ergebnis === "verworfen") {
      if (!DRY) appendFileSync(`${ORDNER}/VERWORFEN.md`, zeileMd);
      schreiben(alt.datei, zeileEntfernen(lesen(alt.datei), alt.zeile)); // Revert
    }
    console.log(`Nachmessung ${alt.wert}: ${alt.vorher} → ${nachher} = ${ergebnis}.`);
  }

  // Höchstens eine Regeländerung je Woche: nach einem Revert gibt es keinen neuen Vorschlag; ein offener bleibt bis zum Urteil.
  let vorschlag: Vorschlag | null = null;
  const ziel = schlechtester(produkte);
  if (nachmessung?.ergebnis === "offen") vorschlag = alt ?? null; // nicht messbar: die Änderung bleibt und wird nächste Woche erneut gemessen
  if (nachmessung?.ergebnis === "verworfen" || nachmessung?.ergebnis === "offen") console.log("Kein neuer Vorschlag: Revert oder offenes Urteil.");
  else if (!ziel) console.log("Alle messbaren Werte am Ziel, kein Vorschlag.");
  else {
    // Zeilen der VERWORFEN.md: `- KW · produkt · wert: a → b · Regelzeile (datei)`
    const verworfen = lesen(`${ORDNER}/VERWORFEN.md`).split("\n").filter((l) => l.startsWith("- ")).map((l) => l.split(" · ").slice(3).join(" · ").replace(/ \([^)]*\)$/, ""));
    vorschlag = await vorschlagen(ziel, vorwoche, verworfen).catch((e: Error) => (console.warn(`Warnung: kein Vorschlag (${e.message})`), null));
    if (vorschlag) schreiben(vorschlag.datei, zeileEinfuegen(lesen(vorschlag.datei), vorschlag.zeile));
  }

  const woche: Woche = { schema: "lernen/1", kw, von: tag(seit), bis: tag(jetzt), erstellt: jetzt.toISOString(), produkte, vorschlag, nachmessung };
  if (!DRY) mkdirSync(ORDNER, { recursive: true });
  schreiben(`${ORDNER}/woche-${kw}.json`, `${JSON.stringify(woche, null, 2)}\n`);
  console.log(DRY ? JSON.stringify(woche, null, 2) : `Woche ${kw}: ${produkte.map((p) => `${p.produkt} ${p.prs} PRs`).join(", ")}, Vorschlag: ${vorschlag ? vorschlag.zeile : "keiner"}.`);

  if (DRY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return console.warn("Ereignis nicht geschrieben (trocken oder Supabase-Variablen fehlen)");
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events`, { method: "POST", headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(ereignisZeile(true, kachelPayload(woche))) });
  if (!res.ok) throw new Error(`Supabase loop_events: ${res.status}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
