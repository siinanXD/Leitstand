/**
 * Kontingent-Sammler je Produkt (SIN-1049, SIN-1047). Liest das Register docs/autonomy/produkte.json, misst und schreibt
 * `loop_snapshot.quotas` bzw. `guthaben` der Zeile `leitstand`. Konto-weite Limits (Vercel) werden über das ganze Team gezählt.
 *
 *   npx tsx scripts/kontingent/sammler.ts
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VERCEL_TOKEN (Deployments, nur lesen), optional VERCEL_TEAM_ID,
 * OPENAI_ADMIN_KEY (Costs, nur lesen, nie loggen). DRY_RUN=1: nur Ausgabe, nichts schreiben.
 * shortcut: gemessen werden Vercel-Deployments des Teams und das OpenAI-Guthaben; Anthropic (Individual-Konto, keine Admin-API), Supabase und GitHub-Rate-Limit folgen in eigenen Issues.
 */
import { readFileSync } from "node:fs";
import { apiGuthaben, vercelTeam, type GuthabenZeile } from "../../src/lib/kontingent/messung";
import { langfuseLuecken, mischeQuotas, pruefeRegister, type Produkt } from "../../src/lib/kontingent/produkte";
import type { Quota } from "../../src/lib/uebersicht";

const env = process.env;
const DRY = env.DRY_RUN === "1";

/** Alle Deployments der letzten 24 h über alle Projekte des Teams, seitenweise (SIN-1047). */
async function vercelTeamDeployments(): Promise<Quota | null> {
  if (!env.VERCEL_TOKEN) {
    console.log("::warning::VERCEL_TOKEN fehlt, Deployments werden nicht gemessen.");
    return null;
  }
  const jetzt = new Date();
  const seit = jetzt.getTime() - 24 * 3_600_000;
  const alle: { uid: string; projectId?: string; created?: number }[] = [];
  let bis: number | null = null;
  for (let seite = 0; seite < 10; seite++) {
    const team = env.VERCEL_TEAM_ID ? `&teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}` : "";
    const res = await fetch(`https://api.vercel.com/v6/deployments?since=${seit}&limit=100${bis ? `&until=${bis}` : ""}${team}`, { headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` } });
    if (!res.ok) throw new Error(`Vercel Team: HTTP ${res.status}`);
    const j = (await res.json()) as { deployments?: typeof alle; pagination?: { next?: number | null } };
    alle.push(...(j.deployments ?? []));
    bis = j.pagination?.next ?? null;
    if (!bis) break;
  }
  return vercelTeam(alle, jetzt);
}

/** OpenAI-Kosten der letzten 31 Tage in $ (Costs-Endpunkt, nur lesend). Ohne Key oder bei Fehler: null. */
async function openaiVerbrauch(): Promise<number | null> {
  if (!env.OPENAI_ADMIN_KEY) return null;
  const res = await fetch(`https://api.openai.com/v1/organization/costs?start_time=${Math.floor(Date.now() / 1000) - 31 * 86400}&bucket_width=1d&limit=31`, { headers: { Authorization: `Bearer ${env.OPENAI_ADMIN_KEY}` } });
  if (!res.ok) {
    console.log(`::warning::OpenAI Costs: HTTP ${res.status}`);
    return null;
  }
  const j = (await res.json()) as { data?: { results?: { amount?: { value?: number } }[] }[] };
  return (j.data ?? []).flatMap((b) => b.results ?? []).reduce((s, r) => s + (r.amount?.value ?? 0), 0);
}

async function schreibe(project: string, neu: Quota[], guthaben: GuthabenZeile[]) {
  const kopf = { apikey: env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  const alt = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_snapshot?project=eq.${encodeURIComponent(project)}&select=quotas`, { headers: kopf });
  if (!alt.ok) throw new Error(`loop_snapshot ${project} lesen: ${alt.status}`);
  const quotas = mischeQuotas(((await alt.json()) as { quotas?: unknown }[])[0]?.quotas, neu);
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_snapshot?on_conflict=project`, {
    method: "POST",
    headers: { ...kopf, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ project, quotas, ...(guthaben.length ? { guthaben } : {}) }),
  });
  if (!res.ok) throw new Error(`loop_snapshot ${project}: ${res.status} ${await res.text()}`);
}

async function main() {
  const produkte = (JSON.parse(readFileSync("docs/autonomy/produkte.json", "utf8")) as { produkte: Produkt[] }).produkte;
  const fehler = pruefeRegister(produkte);
  if (fehler.length) throw new Error(`Register fehlerhaft: ${fehler.join("; ")}`);
  for (const l of langfuseLuecken(produkte)) console.log(`::warning::${l}`);
  const team = await vercelTeamDeployments().catch((e) => (console.log(`::warning::${(e as Error).message}`), null));
  const openai = (JSON.parse(readFileSync("docs/autonomy/kontingente.json", "utf8")) as { api_guthaben?: { openai?: { einzahlung?: number; link?: string } } }).api_guthaben?.openai;
  const einzahlung = openai?.einzahlung ?? 0;
  const guthaben = einzahlung > 0 ? [apiGuthaben("OpenAI", einzahlung, await openaiVerbrauch(), !!env.OPENAI_ADMIN_KEY, new Date(), openai?.link ?? null)] : [];
  console.log(JSON.stringify({ team, guthaben }, null, 2));
  if (DRY) return;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt");
  // Ohne Messwert bleibt die Zeile unberührt; neue Werte werden nach Name in die bestehenden quotas gemischt.
  if (team || guthaben.length) await schreibe("leitstand", team ? [team] : [], guthaben);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
