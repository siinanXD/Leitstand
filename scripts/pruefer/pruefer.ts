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
import { ladeAuftrag, standMarker } from "../loop/beleg-stand.mjs";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { ANWEISUNG, MAX_AUSGABE_TOKENS, SCHEMA, apiFehler, leseApiJson, begrenze, bewerte, eingabe, hatHoch, kommentar, kostenUsd, leseAntwort, lesePreise, maxDiffZeichen, pruefeMitRueckfall, type Ergebnis, type Reviewer } from "../../src/lib/pruefer/pruefer";

const env = process.env;
const CLAUDE_MODELL = env.PRUEFER_CLAUDE_MODELL || "claude-sonnet-5-5";
const DRY = env.DRY_RUN === "1";
const [nummer, basis, head] = process.argv.slice(2);
if (!nummer || !/^\d+$/.test(nummer) || !basis || !head) {
  console.error("Aufruf: pruefer.ts <PR-Nummer> <Basis-SHA> <Head-SHA>");
  process.exit(2);
}
const sh = (cmd: string, ...a: string[]) => execFileSync(cmd, a, { encoding: "utf8", maxBuffer: 50_000_000 });

async function modell(text: string, name: string): Promise<{ ergebnis: Ergebnis; ein: number; aus: number }> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: name,
      max_completion_tokens: MAX_AUSGABE_TOKENS,
      reasoning_effort: "low",
      messages: [{ role: "system", content: ANWEISUNG }, { role: "user", content: text }],
      response_format: { type: "json_schema", json_schema: { name: "pruefung", strict: true, schema: SCHEMA } },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.text();
  if (!res.ok) throw apiFehler("OpenAI", res.status, body, [env.OPENAI_API_KEY ?? "", env.ANTHROPIC_API_KEY ?? ""]);
  const j = leseApiJson(body, "OpenAI") as { choices?: { finish_reason?: string; message?: { content?: string; refusal?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  if (j?.choices?.[0]?.finish_reason === "length") throw new Error(`OpenAI: Tokenbudget (${MAX_AUSGABE_TOKENS}) für Reasoning und Antwort ausgeschöpft; kein vollständiger Review`);
  if (j?.choices?.[0]?.message?.refusal) throw new Error("OpenAI: Review abgelehnt (refusal)");
  return { ergebnis: leseAntwort(j.choices?.[0]?.message?.content ?? ""), ein: j.usage?.prompt_tokens ?? 0, aus: j.usage?.completion_tokens ?? 0 };
}

/** Rückfall (SIN-696): derselbe Prompt und dasselbe Schema als native JSON-Ausgabe. */
async function claude(text: string): Promise<{ ergebnis: Ergebnis; ein: number; aus: number }> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("OpenAI-API-Kontingent erschöpft und ANTHROPIC_API_KEY fehlt");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: CLAUDE_MODELL,
      max_tokens: MAX_AUSGABE_TOKENS,
      system: ANWEISUNG,
      messages: [{ role: "user", content: text }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.text();
  if (!res.ok) throw apiFehler("Anthropic", res.status, body, [env.OPENAI_API_KEY ?? "", env.ANTHROPIC_API_KEY ?? ""]);
  const j = leseApiJson(body, "Anthropic") as { stop_reason?: string; content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
  if (j?.stop_reason === "max_tokens") throw new Error(`Anthropic: Tokenbudget (${MAX_AUSGABE_TOKENS}) ausgeschöpft; kein vollständiger Review`);
  if (j?.stop_reason === "refusal") throw new Error("Anthropic: Review abgelehnt (refusal)");
  const textAntwort = j?.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("") ?? "";
  return { ergebnis: leseAntwort(textAntwort), ein: j.usage?.input_tokens ?? 0, aus: j.usage?.output_tokens ?? 0 };
}

async function ledger(ok: boolean, payload: unknown) {
  if (DRY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return console.log("::warning::Kosten nicht ins Ledger geschrieben (trocken oder Supabase-Variablen fehlen)");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    // SIN-848: `grund` ist die Pflichtspalte für rote Läufe (SIN-617); `payload` hält das Ergebnis als Structured JSON.
    body: JSON.stringify({ project: "leitstand", agent: "pruefer", step: "pruefer", status: ok ? "ok" : "fehler", issue: null, pr: Number(nummer), run_id: env.GITHUB_RUN_ID ?? null, grund: ok ? null : String((payload as { grund?: string })?.grund ?? "unbekannt").slice(0, 500), payload }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) console.log(`::warning::loop_events: HTTP ${res.status}`);
}

async function main() {
  const name = env.PRUEFER_MODELL;
  const preise = lesePreise(env.PRUEFER_PREIS_EIN, env.PRUEFER_PREIS_AUS);
  if (!name || !preise) throw new Error("PRUEFER_MODELL, PRUEFER_PREIS_EIN und PRUEFER_PREIS_AUS fehlen (Repo-Variablen, Werte aus der OpenAI-Doku)");
  if (!DRY && !env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY fehlt");

  const pr = JSON.parse(sh("gh", "pr", "view", nummer, "--json", "title,body")) as { title: string; body: string };
  const issueNr = /Closes #(\d+)/i.exec(pr.body ?? "")?.[1];
  // Trockenlauf nutzt nur Startkontext und erzeugt grundsätzlich keinen gültigen Stand.
  const issue = DRY
    ? { ...(issueNr ? JSON.parse(sh("gh", "issue", "view", issueNr, "--json", "title,body")) : { title: pr.title, body: pr.body }), hash: "" }
    : await ladeAuftrag(pr.title, env.LINEAR_API_KEY);
  const { dateien, diff } = lesePrDiff(basis, head);
  const { text, gekuerzt } = begrenze(diff, maxDiffZeichen(preise));
  const eing = eingabe({ issue: issue ? `${issue.title}\n${issue.body}` : `(kein Issue verlinkt) ${pr.body ?? ""}`, titel: pr.title, dateien, diff: text, gekuerzt });

  let ergebnis: Ergebnis = { bestanden: true, funde: [] };
  let usd: number | null = null;
  let reviewer: Reviewer = "codex";
  let genutzt = name;
  if (DRY) console.log(`[trocken] ${dateien.length} Dateien, Eingabe ${eing.length} Zeichen, kein OpenAI-Aufruf`);
  else {
    const { r, reviewer: wer } = await pruefeMitRueckfall(
      async () => ({ ...(await modell(eing, name)), kosten: true }),
      async () => ({ ...(await claude(eing)), kosten: false }),
    );
    reviewer = wer;
    ergebnis = r.ergebnis;
    if (wer === "claude") {
      genutzt = CLAUDE_MODELL;
      console.log("::warning::OpenAI-API-Kontingent erschöpft, Rückfall auf Claude");
    } else usd = kostenUsd({ eingabe: r.ein, ausgabe: r.aus }, preise);
  }
  ergebnis = bewerte(ergebnis, dateien, gekuerzt, DRY ? undefined : issue.body);
  const hinweis = DRY ? "**Trockenlauf: keine unabhängige Prüfung oder Live-Abnahme.**\n\n" : "";
  writeFileSync(DRY ? "pruefer-trockenlauf.md" : "pruefer-kommentar.md", hinweis + kommentar(ergebnis, genutzt, usd, reviewer) + `\n\n${!DRY && ergebnis.bestanden ? standMarker(head, issue.hash) : ""}\nGeprüfter Commit: \`${head}\`\nGeprüfte Basis: \`${basis}\``);
  if (hatHoch(ergebnis)) writeFileSync("pruefer-hoch.txt", "hoch\n");
  await ledger(true, { modell: genutzt, reviewer, bestanden: ergebnis.bestanden, funde: ergebnis.funde.length, hoch: hatHoch(ergebnis), kosten_eur_usd: usd, issue: issueNr ?? null });
  console.log(`Prüfer: ${ergebnis.bestanden ? "bestanden" : "nicht bestanden"}, ${ergebnis.funde.length} Funde${usd === null ? "" : `, ${usd.toFixed(4)} $`}`);
  process.exit(ergebnis.bestanden ? 0 : 1);
}

main().catch(async (e: Error) => {
  // SIN-848: als Annotation, damit der Grund ohne Log-Download sichtbar ist (Logs sind nicht für alle lesbar).
  console.log(`::error::Prüfer abgebrochen: ${e.message}`);
  await ledger(false, { grund: e.message });
  process.exit(2);
});
