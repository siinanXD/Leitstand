/**
 * Kontingent-Sammler je Produkt (SIN-1049). Liest das Register docs/autonomy/produkte.json, misst je Produkt und schreibt
 * `loop_snapshot.quotas` je `project`. Konto-weite Limits stehen zusätzlich als Summe in der Zeile `leitstand`.
 *
 *   npx tsx scripts/kontingent/sammler.ts
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VERCEL_TOKEN (Deployments, nur lesen). DRY_RUN=1: nur Ausgabe, nichts schreiben.
 * shortcut: gemessen werden nur Vercel-Deployments der letzten 24 h; Langfuse und Sentry folgen, sobald das Register ihre Projekte nennt.
 */
import { readFileSync } from "node:fs";
import { langfuseLuecken, pruefeRegister, sammle, type Messwert, type Produkt } from "../../src/lib/kontingent/produkte";

const env = process.env;
const DRY = env.DRY_RUN === "1";
/** Hobby-Plan: 100 Deployments pro Tag für das ganze Konto. */
const VERCEL_DEPLOYS_PRO_TAG = 100;
const NAME_DEPLOYS = "Deploys pro Tag";

async function vercelDeploys(projekt: string): Promise<number> {
  const seit = Date.now() - 24 * 3_600_000;
  const res = await fetch(`https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projekt)}&since=${seit}&limit=100`, { headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` } });
  if (!res.ok) throw new Error(`Vercel ${projekt}: HTTP ${res.status}`);
  return ((await res.json()) as { deployments?: unknown[] }).deployments?.length ?? 0;
}

async function messe(produkte: Produkt[]): Promise<Messwert[]> {
  const werte: Messwert[] = [];
  for (const p of produkte) {
    if (!p.vercel.projekt) continue;
    if (!env.VERCEL_TOKEN) {
      console.log("::warning::VERCEL_TOKEN fehlt, Deployments werden nicht gemessen.");
      break;
    }
    try {
      werte.push({ produkt: p.id, name: NAME_DEPLOYS, used: await vercelDeploys(p.vercel.projekt), limit: VERCEL_DEPLOYS_PRO_TAG, konto: true });
    } catch (e) {
      console.log(`::warning::${(e as Error).message}`);
    }
  }
  return werte;
}

async function schreibe(project: string, quotas: unknown[]) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_snapshot?on_conflict=project`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ project, quotas }),
  });
  if (!res.ok) throw new Error(`loop_snapshot ${project}: ${res.status} ${await res.text()}`);
}

async function main() {
  const produkte = (JSON.parse(readFileSync("docs/autonomy/produkte.json", "utf8")) as { produkte: Produkt[] }).produkte;
  const fehler = pruefeRegister(produkte);
  if (fehler.length) throw new Error(`Register fehlerhaft: ${fehler.join("; ")}`);
  for (const l of langfuseLuecken(produkte)) console.log(`::warning::${l}`);
  const s = sammle(produkte, await messe(produkte));
  console.log(JSON.stringify(s, null, 2));
  if (DRY) return;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt");
  for (const [id, quotas] of Object.entries(s.je_produkt)) await schreibe(id, id === "leitstand" ? [...quotas, ...s.konto] : quotas);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
