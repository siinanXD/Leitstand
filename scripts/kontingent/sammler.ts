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
import { apiGuthaben, vercelTeam, VERCEL_LIMIT_TAG, type Deployment, type GuthabenZeile } from "../../src/lib/kontingent/messung";
import { langfuseLuecken, mischeQuotas, pruefeRegister, sammle, type Messwert, type Produkt } from "../../src/lib/kontingent/produkte";
import type { Quota } from "../../src/lib/uebersicht";

const env = process.env;
const DRY = env.DRY_RUN === "1";

/** Alle Deployments der letzten 24 h über alle Projekte des Teams, seitenweise (SIN-1047). */
async function vercelTeamDeployments(): Promise<Deployment[] | null> {
  if (!env.VERCEL_TOKEN) {
    console.log("::warning::VERCEL_TOKEN fehlt, Deployments werden nicht gemessen.");
    return null;
  }
  const seit = Date.now() - 24 * 3_600_000;
  const alle: Deployment[] = [];
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
  return alle;
}

/** OpenAI-Kosten in $ seit `seit` (Datum der Einzahlung; Costs-Endpunkt, nur lesend), seitenweise. Ohne Key oder bei Fehler: null. */
async function openaiVerbrauch(seit: string): Promise<number | null> {
  if (!env.OPENAI_ADMIN_KEY) return null;
  const start = Math.floor(Date.parse(seit) / 1000);
  if (!Number.isFinite(start)) return null;
  let summe = 0;
  let seite: string | null = null;
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`https://api.openai.com/v1/organization/costs?start_time=${start}&bucket_width=1d&limit=180${seite ? `&page=${encodeURIComponent(seite)}` : ""}`, { headers: { Authorization: `Bearer ${env.OPENAI_ADMIN_KEY}` } });
    if (!res.ok) {
      console.log(`::warning::OpenAI Costs: HTTP ${res.status}`);
      return null;
    }
    const j = (await res.json()) as { data?: { results?: { amount?: { value?: number } }[] }[]; has_more?: boolean; next_page?: string | null };
    summe += (j.data ?? []).flatMap((b) => b.results ?? []).reduce((x, r) => x + (r.amount?.value ?? 0), 0);
    seite = j.has_more ? (j.next_page ?? null) : null;
    if (!seite) return summe;
  }
  return null;
}

async function schreibe(project: string, neu: Quota[], guthaben: GuthabenZeile[], veraltet: string[] = []) {
  const kopf = { apikey: env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  const alt = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_snapshot?project=eq.${encodeURIComponent(project)}&select=quotas,guthaben`, { headers: kopf });
  if (!alt.ok) throw new Error(`loop_snapshot ${project} lesen: ${alt.status}`);
  const zeile = ((await alt.json()) as { quotas?: unknown; guthaben?: unknown }[])[0];
  const quotas = mischeQuotas(zeile?.quotas, neu).filter((q) => !veraltet.includes((q as { name?: string })?.name ?? ""));
  // Guthaben anderer Dienste bleiben erhalten; ein Eintrag desselben Dienstes wird ersetzt.
  const vorher = typeof zeile?.guthaben === "string" ? JSON.parse(zeile.guthaben) : zeile?.guthaben;
  const dienste = new Set(guthaben.map((g) => g.dienst));
  const gemischt = [...(Array.isArray(vorher) ? vorher : []).filter((g) => !dienste.has((g as { dienst?: string })?.dienst ?? "")), ...guthaben];
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_snapshot?on_conflict=project`, {
    method: "POST",
    headers: { ...kopf, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ project, quotas, ...(guthaben.length ? { guthaben: gemischt } : {}) }),
  });
  if (!res.ok) throw new Error(`loop_snapshot ${project}: ${res.status} ${await res.text()}`);
}

async function main() {
  const produkte = (JSON.parse(readFileSync("docs/autonomy/produkte.json", "utf8")) as { produkte: Produkt[] }).produkte;
  const fehler = pruefeRegister(produkte);
  if (fehler.length) throw new Error(`Register fehlerhaft: ${fehler.join("; ")}`);
  for (const l of langfuseLuecken(produkte)) console.log(`::warning::${l}`);
  const jetzt = new Date();
  const deployments = await vercelTeamDeployments().catch((e) => (console.log(`::warning::${(e as Error).message}`), null));
  const team = deployments ? vercelTeam(deployments, jetzt) : null;
  // Je Produkt bleibt die Anzeige aus SIN-1049: Deployments des eigenen Vercel-Projekts (ID oder Name); das Limit gilt fürs Team.
  const werte: Messwert[] = deployments
    ? produkte.filter((p) => p.vercel.projekt).map((p) => ({ produkt: p.id, name: "Deploys pro Tag", used: vercelTeam(deployments.filter((d) => d.projectId === p.vercel.projekt || d.name === p.vercel.projekt), jetzt).used, limit: VERCEL_LIMIT_TAG }))
    : [];
  const je = sammle(produkte, werte).je_produkt;
  const openai = (JSON.parse(readFileSync("docs/autonomy/kontingente.json", "utf8")) as { api_guthaben?: { openai?: { einzahlung?: number; seit?: string; link?: string } } }).api_guthaben?.openai;
  const einzahlung = openai?.einzahlung ?? 0;
  const verbrauch = einzahlung > 0 && openai?.seit ? await openaiVerbrauch(openai.seit) : null;
  const guthaben = [apiGuthaben("OpenAI", einzahlung, verbrauch, !!env.OPENAI_ADMIN_KEY, jetzt, openai?.link ?? null)];
  console.log(JSON.stringify({ team, je_produkt: je, guthaben }, null, 2));
  if (DRY) return;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt");
  // Ohne Messwert bleibt die Zeile unberührt; neue Werte werden nach Name in die bestehenden quotas gemischt.
  // Die alten, je Projekt gezählten Konto-Zeilen der Zeile `leitstand` fallen weg (zeigten ein falsches Tageslimit).
  await schreibe("leitstand", team ? [team] : [], guthaben, team ? ["Deploys pro Tag", "Deploys pro Tag (alle Produkte)"] : []);
  for (const [id, quotas] of Object.entries(je)) if (id !== "leitstand" && quotas.length) await schreibe(id, quotas, []);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
