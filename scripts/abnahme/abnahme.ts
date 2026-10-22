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
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { bewerteText, bewerteZeilen, einsetzen, ereignisZeile, parseProben, type Ergebnis, type Probe } from "../../src/lib/abnahme/abnahme";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const zeitlimit = () => AbortSignal.timeout(20_000);
const supabaseKopf = () => ({ apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? "", Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY ?? ""}` });

async function fuehreAus(p: Probe): Promise<Ergebnis> {
  const feld = (n: string) => einsetzen(p[n] ?? "", env);
  if (p.art === "http") {
    const url = feld("url");
    // SIN-967: GitHub-API mit Token abrufen; ohne Token teilen sich Runner 60 Abrufe je Stunde und IP.
    const kopf = url.startsWith("https://api.github.com/") && env.GH_TOKEN ? { Authorization: `Bearer ${env.GH_TOKEN}` } : undefined;
    const res = await fetch(url, { headers: kopf, signal: zeitlimit() });
    const erwartet = Number(p.status ?? 200);
    return res.status === erwartet ? bewerteText(p, await res.text()) : { ok: false, grund: `HTTP ${res.status}, erwartet ${erwartet}` };
  }
  if (p.art === "db") {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt");
    // Nur GET auf die REST-Schnittstelle: eine Probe kann nichts ändern.
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${feld("rest")}`, { headers: supabaseKopf(), signal: zeitlimit() });
    return res.ok ? bewerteZeilen(p, await res.json(), Date.now()) : { ok: false, grund: `Abfrage: HTTP ${res.status}` };
  }
  if (p.art === "datei") {
    return existsSync(p.pfad) ? bewerteText(p, readFileSync(p.pfad, "utf8")) : { ok: false, grund: `${p.pfad} fehlt` };
  }
  if (!env.GH_TOKEN) throw new Error("GH_TOKEN fehlt");
  const res = await fetch(`https://api.github.com/repos/${p.repo}/contents/${p.pfad.split("/").map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github.raw+json" },
    signal: zeitlimit(),
  });
  return res.ok ? bewerteText(p, await res.text()) : { ok: false, grund: `${p.repo}/${p.pfad}: HTTP ${res.status}` };
}

async function main() {
  // SIN-896: Altbestand in docs/abnahme.yml, neue Proben je Issue in docs/abnahme/<SIN-xxx>.yml (keine gemeinsame Datei mehr).
  const basis = env.ABNAHME_DATEI ?? "docs/abnahme.yml";
  const ordner = env.ABNAHME_DATEI ? null : "docs/abnahme";
  const dateien = [basis, ...(ordner && existsSync(ordner) ? readdirSync(ordner).filter((f) => f.endsWith(".yml")).sort().map((f) => `${ordner}/${f}`) : [])];
  const proben = parseProben(dateien.map((f) => readFileSync(f, "utf8")).join("\n"));
  const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : null;
  const zeilen = [];
  for (const p of proben) {
    const e = await fuehreAus(p).catch((f): Ergebnis => ({ ok: false, grund: `Nicht geprüft: ${f instanceof Error ? f.message : f}` }));
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
