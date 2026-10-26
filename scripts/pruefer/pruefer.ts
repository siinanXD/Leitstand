/**
 * Prüfer mit zweitem Modell (SIN-639). Aufruf aus pruefer.yml:
 *
 *   npx tsx scripts/pruefer/pruefer.ts <PR-Nummer> <Basis-SHA> <Head-SHA>
 *
 * Liest PR und Issue (gh), schickt Diff und Issue an OpenAI (Chat Completions, Structured Outputs), schreibt pruefer-kommentar.md
 * und Kosten als loop_events (Schritt pruefer, payload.kosten_eur_usd). Exit 1 bei „nicht bestanden“, Datei pruefer-hoch.txt bei Schwere hoch.
 * Env: OPENAI_API_KEY, PRUEFER_MODELL, PRUEFER_PREIS_EIN, PRUEFER_PREIS_AUS (USD je 1 Mio. Tokens, aus der OpenAI-Doku), GH_TOKEN,
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (optional). DRY_RUN=1: kein Netz zu OpenAI und Supabase, Diff und Regeln laufen.
 */
import { lesePrDiff } from "../../src/lib/pruefer/git";
import { modellFuer } from "../../src/lib/kennzahlen/modelle";
import { ladeAuftrag, standMarker } from "../loop/beleg-stand.mjs";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { ANWEISUNG, DECKEL_USD_TAG, KOSTENDECKEL_USD, KOSTENDECKEL_USD_HOCH, MAX_AUSGABE_TOKENS, MAX_AUSGABE_TOKENS_HOCH, MAX_AUSGABE_TOKENS_RUECKFALL, denkstufe, istGateDiff, type Denkstufe, SCHEMA, apiFehler, leseApiJson, begrenze, bewerte, eingabe, geaenderteZeilen, hatHoch, hatRisiko, kommentar, kostenUsd, leseAntwort, leseVorfunde, lesePreise, MARKER, maxDiffZeichen, pruefeMitRueckfall, type Ergebnis, type Folgerunde, type Preise, type Reviewer } from "../../src/lib/pruefer/pruefer";

const env = process.env;
const CLAUDE_MODELL = env.PRUEFER_CLAUDE_MODELL || modellFuer("pruefer");
const DRY = env.DRY_RUN === "1";
const [nummer, basis, head] = process.argv.slice(2);
if (!nummer || !/^\d+$/.test(nummer) || !basis || !head) {
  console.error("Aufruf: pruefer.ts <PR-Nummer> <Basis-SHA> <Head-SHA>");
  process.exit(2);
}
// SIN-939: Produkt-PR (gh liest GH_REPO) landet im Ledger unter dem Produkt, nicht unter leitstand.
const produkt = /\/Content-Agent-Lernapp$/i.test(env.GH_REPO ?? "") ? "lernapp" : "leitstand";
const sh = (cmd: string, ...a: string[]) => execFileSync(cmd, a, { encoding: "utf8", maxBuffer: 50_000_000 });

type Stufe = { stufe: Denkstufe; ueberDeckel: boolean; ersteRunde: boolean };
const ERSTE_RUNDE = "Erste Runde: Nenne alle Funde auf einmal; eine zweite Runde prüft nur nach.";
const anweisung = (s: Stufe) => (s.ersteRunde ? `${ANWEISUNG}\n${ERSTE_RUNDE}` : ANWEISUNG);

async function modell(text: string, name: string, s: Stufe): Promise<{ ergebnis: Ergebnis; ein: number; aus: number }> {
  const budget = s.stufe === "high" ? MAX_AUSGABE_TOKENS_HOCH : MAX_AUSGABE_TOKENS;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: name,
      max_completion_tokens: budget,
      reasoning_effort: s.stufe,
      messages: [{ role: "system", content: anweisung(s) }, { role: "user", content: text }],
      response_format: { type: "json_schema", json_schema: { name: "pruefung", strict: true, schema: SCHEMA } },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.text();
  if (!res.ok) throw apiFehler("OpenAI", res.status, body, geheim());
  return openaiAntwort(body, budget);
}

const geheim = () => [env.OPENAI_API_KEY ?? "", env.ANTHROPIC_API_KEY ?? ""];

/** Liest Ergebnis und Tokens aus der OpenAI-Antwort; abgeschnittene oder abgelehnte Reviews sind Fehler. */
function openaiAntwort(body: string, budget: number): { ergebnis: Ergebnis; ein: number; aus: number } {
  const j = leseApiJson(body, "OpenAI") as { choices?: { finish_reason?: string; message?: { content?: string; refusal?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const wahl = j.choices?.[0];
  const nachricht = wahl?.message;
  if (wahl?.finish_reason === "length") throw new Error(`OpenAI: Tokenbudget (${budget}) für Reasoning und Antwort ausgeschöpft; kein vollständiger Review`);
  if (nachricht?.refusal) throw new Error("OpenAI: Review abgelehnt (refusal)");
  const usage = { prompt_tokens: 0, completion_tokens: 0, ...j.usage };
  return { ergebnis: leseAntwort(nachricht?.content ?? ""), ein: usage.prompt_tokens, aus: usage.completion_tokens };
}

/** Rückfall (SIN-696): derselbe Prompt und dasselbe Schema als native JSON-Ausgabe. */
async function claude(text: string, s: Stufe): Promise<{ ergebnis: Ergebnis; ein: number; aus: number }> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("OpenAI-API-Kontingent erschöpft und ANTHROPIC_API_KEY fehlt");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: CLAUDE_MODELL,
      max_tokens: MAX_AUSGABE_TOKENS_RUECKFALL,
      system: anweisung(s),
      messages: [{ role: "user", content: text }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.text();
  if (!res.ok) throw apiFehler("Anthropic", res.status, body, geheim());
  return claudeAntwort(body);
}

/** Liest Ergebnis und Tokens aus der Anthropic-Antwort; abgeschnittene oder abgelehnte Reviews sind Fehler. */
function claudeAntwort(body: string): { ergebnis: Ergebnis; ein: number; aus: number } {
  const j = leseApiJson(body, "Anthropic") as { stop_reason?: string; content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
  if (j.stop_reason === "max_tokens") throw new Error(`Anthropic: Tokenbudget (${MAX_AUSGABE_TOKENS_RUECKFALL}) ausgeschöpft; kein vollständiger Review`);
  if (j.stop_reason === "refusal") throw new Error("Anthropic: Review abgelehnt (refusal)");
  const textAntwort = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  const usage = { input_tokens: 0, output_tokens: 0, ...j.usage };
  return { ergebnis: leseAntwort(textAntwort), ein: usage.input_tokens, aus: usage.output_tokens };
}

async function ledger(ok: boolean, payload: unknown) {
  if (DRY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return console.log("::warning::Kosten nicht ins Ledger geschrieben (trocken oder Supabase-Variablen fehlen)");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    // SIN-848: `grund` ist die Pflichtspalte für rote Läufe (SIN-617); `payload` hält das Ergebnis als Structured JSON.
    body: JSON.stringify({ project: produkt, agent: "pruefer", step: "pruefer", status: ok ? "ok" : "fehler", issue: null, pr: Number(nummer), run_id: env.GITHUB_RUN_ID ?? null, grund: ok ? null : String((payload as { grund?: string })?.grund ?? "unbekannt").slice(0, 500), payload }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) console.log(`::warning::loop_events: HTTP ${res.status}`);
}

/** Prüfer-Kosten heute (alle Produkte) aus dem Ledger; unlesbar zählt als Deckel erreicht, damit nichts ungedeckelt teuer läuft. */
async function heuteKostenUsd(deckel: number): Promise<number> {
  if (DRY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return 0;
  // shortcut: Tag nach UTC, nicht nach Berliner Zeit; ausbauen, falls der Deckel um Mitternacht stört.
  const seit = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events?step=eq.pruefer&created_at=gte.${seit}&select=payload&limit=1000`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!res?.ok) return deckel;
  const zeilen = (await res.json()) as { payload: { kosten_eur_usd?: number | null } | null }[];
  return zeilen.reduce((s, z) => s + (z.payload?.kosten_eur_usd ?? 0), 0);
}

/** SIN-928: Denkstufe aus Runde, Gate-Diff, Diffgröße und Tagesdeckel. */
async function stufeWaehlen(dateien: string[], diff: string, vor: Folgerunde | undefined): Promise<Stufe> {
  const deckelUsd = Number(env.PRUEFER_DECKEL_USD_TAG) || DECKEL_USD_TAG;
  const zeilen = diff.split("\n").filter((z) => /^[+-](?![+-]{2} )/.test(z)).length;
  const s = denkstufe({ ersteRunde: !vor, sicherheitsDiff: istGateDiff(dateien), geaenderteZeilen: zeilen, heuteKostenUsd: await heuteKostenUsd(deckelUsd), deckelUsd });
  return { ...s, ersteRunde: !vor };
}

/** SIN-926: Stand der Vorrunde aus dem letzten Prüfer-Kommentar; ohne Kommentar oder lesbaren Commit gilt Runde 1. */
function folgerunde(): Folgerunde | undefined {
  try {
    const kommentare = (JSON.parse(sh("gh", "pr", "view", nummer, "--json", "comments")) as { comments: { body: string }[] }).comments;
    const letzter = kommentare.filter(c => c.body.includes(MARKER)).pop()?.body;
    const vorher = /Geprüfter Commit: `([a-f0-9]{40})`/i.exec(letzter ?? "")?.[1];
    if (!letzter || !vorher) return undefined;
    const diff = sh("git", "diff", "--no-ext-diff", "--no-textconv", "--unified=0", `${vorher}..${head}`);
    return { funde: leseVorfunde(letzter), geaendert: geaenderteZeilen(diff) };
  } catch { return undefined; }
}

/** Issue zum PR: im Trockenlauf aus GitHub (ohne gültigen Stand), sonst der aktuelle Auftrag aus Linear. */
async function auftrag(pr: { title: string; body: string }) {
  const issueNr = /Closes #(\d+)/i.exec(pr.body ?? "")?.[1];
  // Trockenlauf nutzt nur Startkontext und erzeugt grundsätzlich keinen gültigen Stand.
  const issue = DRY
    ? { ...(issueNr ? JSON.parse(sh("gh", "issue", "view", issueNr, "--json", "title,body")) : { title: pr.title, body: pr.body }), hash: "" }
    : await ladeAuftrag(pr.title, env.LINEAR_API_KEY);
  return { issue, issueNr };
}

/** Diff-Zeichen, die in den Kostendeckel je Lauf passen; Stufe `high` hat eigenes Budget (SIN-928). */
const diffGrenze = (preise: Preise, s: Stufe) =>
  s.stufe === "high" ? maxDiffZeichen(preise, KOSTENDECKEL_USD_HOCH, MAX_AUSGABE_TOKENS_HOCH) : maxDiffZeichen(preise, KOSTENDECKEL_USD, MAX_AUSGABE_TOKENS);

type Lauf = { ergebnis: Ergebnis; usd: number | null; reviewer: Reviewer; genutzt: string };

/** Trockenlauf: kein Modellaufruf, leeres Ergebnis. */
function trocken(name: string, dateien: number, zeichen: number): Lauf {
  console.log(`[trocken] ${dateien} Dateien, Eingabe ${zeichen} Zeichen, kein OpenAI-Aufruf`);
  return { ergebnis: { bestanden: true, funde: [] }, usd: null, reviewer: "codex", genutzt: name };
}

/** OpenAI-Review, bei leerem Kontingent Rückfall auf Claude (ohne API-Kosten im Ledger). */
async function pruefen(eing: string, name: string, stufe: Stufe, preise: Preise): Promise<Lauf> {
  const { r, reviewer } = await pruefeMitRueckfall(
    async () => ({ ...(await modell(eing, name, stufe)), kosten: true }),
    async () => ({ ...(await claude(eing, stufe)), kosten: false }),
  );
  if (reviewer === "codex") return { ergebnis: r.ergebnis, usd: kostenUsd({ eingabe: r.ein, ausgabe: r.aus }, preise), reviewer, genutzt: name };
  console.log("::warning::OpenAI-API-Kontingent erschöpft, Rückfall auf Claude");
  return { ergebnis: r.ergebnis, usd: null, reviewer, genutzt: CLAUDE_MODELL };
}

/** Kommentar, Status- und Risiko-Datei für pruefer.yml; der Stand-Marker nur bei bestandenem echten Lauf. */
function schreibeDateien(ergebnis: Ergebnis, lauf: Lauf, stufe: Stufe, hash: string) {
  const hinweis = DRY ? "**Trockenlauf: keine unabhängige Prüfung oder Live-Abnahme.**\n\n" : "";
  const stand = !DRY && ergebnis.bestanden ? standMarker(head, hash) : "";
  writeFileSync(DRY ? "pruefer-trockenlauf.md" : "pruefer-kommentar.md", hinweis + kommentar(ergebnis, lauf.genutzt, lauf.usd, lauf.reviewer, stufe) + `\n\n${stand}\nGeprüfter Commit: \`${head}\`\nGeprüfte Basis: \`${basis}\``);
  if (hatRisiko(ergebnis)) writeFileSync("pruefer-hoch.txt", "hoch\n");
  writeFileSync("pruefer-status.txt", ergebnis.bestanden ? "bestanden\n" : "offen\n");
}

async function main() {
  const name = env.PRUEFER_MODELL;
  const preise = lesePreise(env.PRUEFER_PREIS_EIN, env.PRUEFER_PREIS_AUS);
  if (!name || !preise) throw new Error("PRUEFER_MODELL, PRUEFER_PREIS_EIN und PRUEFER_PREIS_AUS fehlen (Repo-Variablen, Werte aus der OpenAI-Doku)");
  if (!DRY && !env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY fehlt");

  const pr = JSON.parse(sh("gh", "pr", "view", nummer, "--json", "title,body")) as { title: string; body: string };
  const { issue, issueNr } = await auftrag(pr);
  const { dateien, diff } = lesePrDiff(basis, head);
  const vor = folgerunde();
  const stufe = await stufeWaehlen(dateien, diff, vor);
  const { text, gekuerzt } = begrenze(diff, diffGrenze(preise, stufe));
  const eing = eingabe({ issue: issue ? `${issue.title}\n${issue.body}` : `(kein Issue verlinkt) ${pr.body ?? ""}`, titel: pr.title, dateien, diff: text, gekuerzt });

  const lauf = DRY ? trocken(name, dateien.length, eing.length) : await pruefen(eing, name, stufe, preise);
  const { usd, reviewer, genutzt } = lauf;
  const ergebnis = bewerte(lauf.ergebnis, dateien, gekuerzt, DRY ? undefined : issue.body, vor);
  schreibeDateien(ergebnis, { ...lauf, ergebnis }, stufe, issue.hash);
  await ledger(true, { modell: genutzt, reviewer, bestanden: ergebnis.bestanden, funde: ergebnis.funde.length, hoch: hatHoch(ergebnis), kosten_eur_usd: usd, denkstufe: stufe.stufe, erste_runde: stufe.ersteRunde, ueber_deckel: stufe.ueberDeckel, issue: issueNr ?? null });
  console.log(`Prüfer: ${ergebnis.bestanden ? "bestanden" : "nicht bestanden"}, ${ergebnis.funde.length} Funde${usd === null ? "" : `, ${usd.toFixed(4)} $`}`);
  process.exit(ergebnis.bestanden ? 0 : 1);
}

main().catch(async (e: Error) => {
  // SIN-848: als Annotation, damit der Grund ohne Log-Download sichtbar ist (Logs sind nicht für alle lesbar).
  console.log(`::error::Prüfer abgebrochen: ${e.message}`);
  await ledger(false, { grund: e.message });
  process.exit(2);
});
