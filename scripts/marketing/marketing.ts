/**
 * Marketing-Agent (SIN-550). Aufruf aus marketing.yml (.github/workflows/marketing.yml), montags:
 *
 *   npx tsx scripts/marketing/marketing.ts
 *
 * Liest die Eingabe aus einer JSON-Datei (MARKETING_EINGABE, Standard: docs/marketing/eingabe.fixture.json, Form: `Eingabe` in
 * src/lib/marketing/marketing.ts), fragt ein Modell nach den 5 Ausgaben und schreibt 7 Zeilen mit `wartet_auf_freigabe` in `werbemittel`.
 * Kein Zugriff auf Ad-Konten oder Metricool; veröffentlicht wird nichts.
 *
 * Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MARKETING_MODELL (optional), GITHUB_RUN_URL (optional).
 * DRY_RUN=1 oder fehlende Supabase-Variablen: nur Ausgabe im Log. Ohne ANTHROPIC_API_KEY bricht der Lauf ab.
 */
import { readFileSync } from "node:fs";
import { pruefeWerbemittel } from "../../src/lib/anwalt/anwalt";
import { ereignisZeile, leseAusgaben, promptFuer, werbemittelZeilen, type Eingabe } from "../../src/lib/marketing/marketing";

const env = process.env;
const DRY = env.DRY_RUN === "1" || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY;
const MODELL = env.MARKETING_MODELL ?? "claude-haiku-5-5";

async function modell(prompt: string): Promise<unknown> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY fehlt");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODELL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Modell: ${res.status}`);
  const antwort = ((await res.json()) as { content?: { text?: string }[] }).content?.[0]?.text ?? "";
  // shortcut: erstes JSON-Objekt der Antwort, bei Mischtext ausbauen auf strukturierte Ausgabe.
  return JSON.parse(antwort.slice(antwort.indexOf("{"), antwort.lastIndexOf("}") + 1));
}

async function supabase(tabelle: string, zeilen: unknown): Promise<void> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${tabelle}`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(zeilen) });
  if (!res.ok) throw new Error(`Supabase ${tabelle}: ${res.status}`);
}

async function main() {
  const eingabe = JSON.parse(readFileSync(env.MARKETING_EINGABE ?? "docs/marketing/eingabe.fixture.json", "utf8")) as Eingabe;
  const ausgaben = leseAusgaben(await modell(promptFuer(eingabe)));
  if (!ausgaben) {
    if (!DRY) await supabase("loop_events", ereignisZeile(eingabe.produkt, false, 0));
    throw new Error("Modellantwort unvollständig, nichts geschrieben");
  }
  const zeilen = werbemittelZeilen(eingabe.produkt, ausgaben, { modell: MODELL, runUrl: env.GITHUB_RUN_URL ?? null });
  // Anwalt (SIN-552): vor `wartet_auf_freigabe` KI-Kennzeichnung, Fremdmarken, Personendaten prüfen. Anzeigen nennen ihre Plattform.
  const gruende = zeilen.flatMap((z) => pruefeWerbemittel({ text: z.text_inhalt, kiKennzeichnung: z.ki_kennzeichnung }, ["Google", "Meta", "LinkedIn"]).map((g) => `${z.art}: ${g}`));
  if (gruende.length) throw new Error(`Anwalt-Prüfung nicht bestanden, nichts geschrieben:\n${gruende.join("\n")}`);
  if (DRY) return console.log(JSON.stringify(zeilen, null, 2));
  await supabase("werbemittel", zeilen);
  await supabase("loop_events", ereignisZeile(eingabe.produkt, true, zeilen.length));
  console.log(`${zeilen.length} Werbemittel warten auf Freigabe.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
