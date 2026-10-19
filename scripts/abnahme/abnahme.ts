/**
 * Abnahme-Proben (SIN-626). Aufruf aus abnahme.yml (.github/workflows/abnahme.yml, stündlich):
 *
 *   npx tsx scripts/abnahme/abnahme.ts
 *
 * Liest docs/abnahme.yml, führt jede Probe aus (HTTP, lesende Datenbankabfrage, Datei im Checkout, Datei in einem GitHub-Repo)
 * und schreibt je Probe eine Zeile in loop_events (Schritt abnahme, status ok oder failed). Der Push-Auslöser meldet Proben,
 * die länger als 2 Stunden rot sind (Alarm); die Seite „Läuft es wirklich?“ zeigt sie. Keine KI.
 * Eine Probe, die sich nicht ausführen lässt (Secret fehlt, Netz weg), ist rot, nie grün.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (Abfragen und Ergebnisse), GH_TOKEN (AGENT_WORKFLOW_TOKEN, lesend, Art github),
 *      LEITSTAND_URL und weitere Adressen, die in docs/abnahme.yml als ${NAME} stehen.
 * DRY_RUN=1: nur Ausgabe im Log, nichts in loop_events. ABNAHME_DATEI: andere Proben-Datei.
 */
import { readFileSync } from "node:fs";
import { ereignisZeile, parseProben, type Ergebnis } from "../../src/lib/abnahme/abnahme";

import { fuehreAus } from "../../src/lib/abnahme/ausfuehren";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const zeitlimit = () => AbortSignal.timeout(20_000);
const supabaseKopf = () => ({ apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? "", Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY ?? ""}` });

async function main() {
  const proben = parseProben(readFileSync(env.ABNAHME_DATEI ?? "docs/abnahme.yml", "utf8"));
  const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : null;
  const zeilen = [];
  for (const p of proben) {
    const e = await fuehreAus(p, env).catch((f): Ergebnis => ({ ok: false, grund: `Nicht geprüft: ${f instanceof Error ? f.message : f}` }));
    console.log(`${e.ok ? "grün" : "ROT "} ${p.produkt}/${p.id}: ${e.grund}`);
    zeilen.push(ereignisZeile(p, e, env.GITHUB_RUN_ID ?? null, runUrl));
  }
  console.log(`${zeilen.filter((z) => z.status === "ok").length} von ${zeilen.length} Proben grün`);
  if (DRY) return;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return console.log("::warning::SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt: Ergebnisse nicht gespeichert.");
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events`, { method: "POST", headers: { ...supabaseKopf(), "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(zeilen), signal: zeitlimit() });
  if (!res.ok) throw new Error(`loop_events: HTTP ${res.status}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
