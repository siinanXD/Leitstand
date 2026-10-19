/**
 * Prüfer mit zweitem Modell (SIN-639). Aufruf aus pruefer.yml:
 *
 *   npx tsx scripts/pruefer/pruefer.ts <PR-Nummer> <Basis-Ref>
 *
 * Liest PR und Issue (gh), schickt Diff und Issue an OpenAI (Chat Completions, Structured Outputs), schreibt pruefer-kommentar.md
 * und Kosten als loop_events (Schritt pruefer, payload.kosten_eur_usd). Exit 1 bei „nicht bestanden“, Datei pruefer-hoch.txt bei Schwere hoch.
 * Env: OPENAI_API_KEY, PRUEFER_MODELL, PRUEFER_PREIS_EIN, PRUEFER_PREIS_AUS (USD je 1 Mio. Tokens, aus der OpenAI-Doku), GH_TOKEN,
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (optional). DRY_RUN=1: kein Netz zu OpenAI und Supabase, Diff und Regeln laufen.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { ANWEISUNG, MAX_AUSGABE_TOKENS, SCHEMA, begrenze, bewerte, eingabe, hatHoch, istKontingentFehler, kommentar, kostenUsd, leseAntwort, lesePreise, maxDiffZeichen, pruefeMitRueckfall, type Ergebnis, type Reviewer } from "../../src/lib/pruefer/pruefer";
import { auftragStand, auftragText, ladeAuftrag } from "../../src/lib/loop/auftrag";
import { linearId } from "../../src/lib/loop/auswahl";

const env = process.env;
const CLAUDE_MODELL = env.PRUEFER_CLAUDE_MODELL || "claude-sonnet-5-5";
const DRY = env.DRY_RUN === "1";
const [nummer, basis] = process.argv.slice(2);
if (!nummer || !basis) {
  console.error("Aufruf: pruefer.ts <PR-Nummer> <Basis-Ref>");
  process.exit(2);
}
const sh = (cmd: string, ...a: string[]) => execFileSync(cmd, a, { encoding: "utf8", maxBuffer: 50_000_000 });
async function linear<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  if (!env.LINEAR_API_KEY) throw new Error("LINEAR_API_KEY fehlt: aktueller Auftrag nicht prüfbar");
  const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { Authorization: env.LINEAR_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(20_000) });
  const j = await res.json();
  if (!res.ok || j.errors || !j.data) throw new Error(`Linear-Auftrag nicht lesbar: HTTP ${res.status}`);
  return j.data;
}

async function modell(text: string, name: string): Promise<{ ergebnis: Ergebnis; ein: number; aus: number }> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: name,
      max_completion_tokens: MAX_AUSGABE_TOKENS,
      messages: [{ role: "system", content: ANWEISUNG }, { role: "user", content: text }],
      response_format: { type: "json_schema", json_schema: { name: "pruefung", strict: true, schema: SCHEMA } },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const kontingent = istKontingentFehler(res.status, await res.text().catch(() => ""));
    throw Object.assign(new Error(`OpenAI: HTTP ${res.status}`), { kontingent });
  }
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  return { ergebnis: leseAntwort(j.choices?.[0]?.message?.content ?? ""), ein: j.usage?.prompt_tokens ?? 0, aus: j.usage?.completion_tokens ?? 0 };
}

/** Rückfall (SIN-696): derselbe Prompt an Claude, Antwort über erzwungenes Tool im selben Schema. Kosten bleiben offen (kein Preis hinterlegt). */
async function claude(text: string): Promise<{ ergebnis: Ergebnis; ein: number; aus: number }> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("Codex-Kontingent erschöpft und ANTHROPIC_API_KEY fehlt");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: CLAUDE_MODELL,
      max_tokens: MAX_AUSGABE_TOKENS,
      system: ANWEISUNG,
      messages: [{ role: "user", content: text }],
      tools: [{ name: "pruefung", description: "Ergebnis der Prüfung", input_schema: SCHEMA }],
      tool_choice: { type: "tool", name: "pruefung" },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Anthropic: HTTP ${res.status}`);
  const j = (await res.json()) as { content?: { type: string; input?: unknown }[]; usage?: { input_tokens?: number; output_tokens?: number } };
  const tool = j.content?.find((c) => c.type === "tool_use");
  return { ergebnis: leseAntwort(JSON.stringify(tool?.input ?? {})), ein: j.usage?.input_tokens ?? 0, aus: j.usage?.output_tokens ?? 0 };
}

async function ledger(ok: boolean, payload: unknown) {
  if (DRY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return console.log("::warning::Kosten nicht ins Ledger geschrieben (trocken oder Supabase-Variablen fehlen)");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ project: "leitstand", step: "pruefer", status: ok ? "ok" : "fehler", issue: null, pr: Number(nummer), payload }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) console.log(`::warning::loop_events: HTTP ${res.status}`);
}

async function main() {
  const name = env.PRUEFER_MODELL;
  const preise = lesePreise(env.PRUEFER_PREIS_EIN, env.PRUEFER_PREIS_AUS);
  if (!name || !preise) throw new Error("PRUEFER_MODELL, PRUEFER_PREIS_EIN und PRUEFER_PREIS_AUS fehlen (Repo-Variablen, Werte aus der OpenAI-Doku)");
  if (!DRY && !env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY fehlt");

  const pr = JSON.parse(sh("gh", "pr", "view", nummer, "--json", "title,body,headRefOid")) as { title: string; body: string; headRefOid: string };
  const issueNr = linearId(pr.title);
  if (!issueNr) throw new Error("Linear-Kennung im PR-Titel fehlt");
  const auftrag = await ladeAuftrag(linear, issueNr);
  const stand = { head: pr.headRefOid, auftrag: auftragStand(auftrag) };
  const auftragInhalt = auftragText(auftrag);
  const frei = maxDiffZeichen(preise) - auftragInhalt.length;
  if (frei <= 0) throw new Error("Aktueller Auftrag überschreitet den bestehenden Prüf-Kostendeckel; Auftrag eingrenzen, nicht Kommentare abschneiden");
  const dateien = sh("git", "diff", "--name-only", `${basis}...HEAD`).split("\n").filter(Boolean);
  const { text, gekuerzt } = begrenze(sh("git", "diff", "--unified=3", `${basis}...HEAD`), frei);
  const eing = eingabe({ issue: auftragInhalt, titel: pr.title, dateien, diff: text, gekuerzt });

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
      console.log("::warning::Codex-Kontingent erschöpft, Rückfall auf Claude");
    } else usd = kostenUsd({ eingabe: r.ein, ausgabe: r.aus }, preise);
  }
  ergebnis = bewerte(ergebnis, dateien, gekuerzt);
  const aktuell = JSON.parse(sh("gh", "pr", "view", nummer, "--json", "headRefOid")) as { headRefOid: string };
  if (aktuell.headRefOid !== stand.head || auftragStand(await ladeAuftrag(linear, issueNr)) !== stand.auftrag) throw new Error("Auftrag oder PR-Head während der Prüfung geändert; Ergebnis verworfen");
  writeFileSync("pruefer-kommentar.md", kommentar(ergebnis, genutzt, usd, reviewer, DRY || !ergebnis.bestanden ? undefined : stand));
  if (hatHoch(ergebnis)) writeFileSync("pruefer-hoch.txt", "hoch\n");
  await ledger(true, { modell: genutzt, reviewer, bestanden: ergebnis.bestanden, funde: ergebnis.funde.length, hoch: hatHoch(ergebnis), kosten_eur_usd: usd, issue: issueNr ?? null });
  console.log(`Prüfer: ${ergebnis.bestanden ? "bestanden" : "nicht bestanden"}, ${ergebnis.funde.length} Funde${usd === null ? "" : `, ${usd.toFixed(4)} $`}`);
  process.exit(ergebnis.bestanden ? 0 : 1);
}

main().catch(async (e: Error) => {
  console.error(e.message);
  await ledger(false, { grund: e.message });
  process.exit(2);
});
