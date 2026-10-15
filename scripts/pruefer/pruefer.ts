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
import { ANWEISUNG, MAX_AUSGABE_TOKENS, SCHEMA, begrenze, bewerte, eingabe, hatHoch, kommentar, kostenUsd, leseAntwort, lesePreise, maxDiffZeichen, type Ergebnis } from "../../src/lib/pruefer/pruefer";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const [nummer, basis] = process.argv.slice(2);
if (!nummer || !basis) {
  console.error("Aufruf: pruefer.ts <PR-Nummer> <Basis-Ref>");
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
      messages: [{ role: "system", content: ANWEISUNG }, { role: "user", content: text }],
      response_format: { type: "json_schema", json_schema: { name: "pruefung", strict: true, schema: SCHEMA } },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`OpenAI: HTTP ${res.status}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  return { ergebnis: leseAntwort(j.choices?.[0]?.message?.content ?? ""), ein: j.usage?.prompt_tokens ?? 0, aus: j.usage?.completion_tokens ?? 0 };
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

  const pr = JSON.parse(sh("gh", "pr", "view", nummer, "--json", "title,body")) as { title: string; body: string };
  const issueNr = /Closes #(\d+)/i.exec(pr.body ?? "")?.[1];
  const issue = issueNr ? (JSON.parse(sh("gh", "issue", "view", issueNr, "--json", "title,body")) as { title: string; body: string }) : null;
  const dateien = sh("git", "diff", "--name-only", `${basis}...HEAD`).split("\n").filter(Boolean);
  const { text, gekuerzt } = begrenze(sh("git", "diff", "--unified=3", `${basis}...HEAD`), maxDiffZeichen(preise));
  const eing = eingabe({ issue: issue ? `${issue.title}\n${issue.body}` : `(kein Issue verlinkt) ${pr.body ?? ""}`, titel: pr.title, dateien, diff: text, gekuerzt });

  let ergebnis: Ergebnis = { bestanden: true, funde: [] };
  let usd: number | null = null;
  if (DRY) console.log(`[trocken] ${dateien.length} Dateien, Eingabe ${eing.length} Zeichen, kein OpenAI-Aufruf`);
  else {
    const r = await modell(eing, name);
    ergebnis = r.ergebnis;
    usd = kostenUsd({ eingabe: r.ein, ausgabe: r.aus }, preise);
  }
  ergebnis = bewerte(ergebnis, dateien, gekuerzt);
  writeFileSync("pruefer-kommentar.md", kommentar(ergebnis, name, usd));
  if (hatHoch(ergebnis)) writeFileSync("pruefer-hoch.txt", "hoch\n");
  await ledger(true, { modell: name, bestanden: ergebnis.bestanden, funde: ergebnis.funde.length, hoch: hatHoch(ergebnis), kosten_eur_usd: usd, issue: issueNr ?? null });
  console.log(`Prüfer: ${ergebnis.bestanden ? "bestanden" : "nicht bestanden"}, ${ergebnis.funde.length} Funde${usd === null ? "" : `, ${usd.toFixed(4)} $`}`);
  process.exit(ergebnis.bestanden ? 0 : 1);
}

main().catch(async (e: Error) => {
  console.error(e.message);
  await ledger(false, { grund: e.message });
  process.exit(2);
});
