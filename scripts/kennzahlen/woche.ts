/**
 * Wochenwerte der drei Kennzahlen (SIN-969, Regeln: docs/decisions/SIN-630-drei-kennzahlen.md). Aufruf: npx tsx scripts/kennzahlen/woche.ts
 * Berechnet die laufende Woche (Montag, UTC) mit src/lib/kennzahlen/kennzahlen.ts und schreibt per Upsert in kennzahlen_woche
 * (on_conflict=produkt,kennzahl,woche; idempotent). Ohne Nenner keine Zeile. DRY_RUN=1: nur Ausgabe.
 * Quellen: pipeline_run_costs und die Sicht kennzahlen_einheiten (Lern-App-Datenbank, Spalten siehe Entscheidungsdatei), GitHub-PRs.
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GH_TOKEN (lesend), KENNZAHLEN_REPOS (Standard Leitstand und Lern-App), KENNZAHLEN_PRODUKT (Standard lernapp).
 */
import { wochenStart, wochenZeilen, type Aenderung, type Einheit, type Kosten } from "../../src/lib/kennzahlen/kennzahlen";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const PRODUKT = env.KENNZAHLEN_PRODUKT ?? "lernapp";
const REPOS = (env.KENNZAHLEN_REPOS ?? "siinanXD/Leitstand,siinanXD/Content-Agent-Lernapp").split(",").map((r) => r.trim()).filter(Boolean);

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const sbKopf: Record<string, string> = key ? { apikey: key, Authorization: `Bearer ${key}` } : {};

async function sb(pfad: string): Promise<Record<string, unknown>[] | null> {
  if (!url || !key) throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt");
  const res = await fetch(`${url}/rest/v1/${pfad}`, { headers: sbKopf, signal: AbortSignal.timeout(30_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${pfad.split("?")[0]} lesen: ${res.status}`);
  return (await res.json()) as Record<string, unknown>[];
}

async function einheiten(): Promise<Einheit[]> {
  const z = await sb("kennzahlen_einheiten?select=bestanden_am,veroeffentlicht,erster_durchlauf_bestanden,quelle_kurs_passend,in_roter_probe&limit=10000");
  if (!z) {
    console.warn("Sicht kennzahlen_einheiten fehlt: keine Zeilen für Verkaufsfertig und Kosten.");
    return [];
  }
  return z.map((r) => ({
    bestandenAm: (r.bestanden_am as string | null) ?? null,
    veroeffentlicht: r.veroeffentlicht === true,
    ersterDurchlaufBestanden: r.erster_durchlauf_bestanden === true,
    quelleKursPassend: r.quelle_kurs_passend === true,
    inRoterProbe: r.in_roter_probe === true,
  }));
}

async function kosten(ab: string): Promise<Kosten[]> {
  const z = (await sb(`pipeline_run_costs?select=created_at,cost_eur&created_at=gte.${ab}&limit=10000`)) ?? [];
  return z.flatMap((r) => (Number.isFinite(Number(r.cost_eur)) && r.cost_eur !== null && typeof r.created_at === "string" ? [{ am: r.created_at, eur: Number(r.cost_eur) }] : []));
}

type Pr = { number: number; title: string; body: string | null; merged_at: string | null };

/** Gemergte PRs ab `ab`. Ein späterer PR binnen 48 h, der `#<nr>` nennt, nimmt zurück (Titel „Revert“) oder repariert (Titel „fix“). shortcut: eine Seite mit 100 je Repo, rote Probe je PR nicht zuordenbar, bei Bedarf ausbauen. */
async function aenderungen(ab: number): Promise<Aenderung[]> {
  const aus: Aenderung[] = [];
  for (const repo of REPOS) {
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100`, {
      headers: { Accept: "application/vnd.github+json", ...(env.GH_TOKEN ? { Authorization: `Bearer ${env.GH_TOKEN}` } : {}) },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`GitHub ${repo}: ${res.status}`);
    const prs = ((await res.json()) as Pr[]).filter((p) => p.merged_at && Date.parse(p.merged_at) >= ab) as (Pr & { merged_at: string })[];
    for (const p of prs) {
      const nennt = (q: Pr) => new RegExp(`#${p.number}\\b`).test(`${q.title} ${q.body ?? ""}`);
      const spaeter = (muster: RegExp) => prs.find((q) => q.number !== p.number && Date.parse(q.merged_at!) > Date.parse(p.merged_at) && muster.test(q.title) && nennt(q))?.merged_at ?? null;
      aus.push({ gemergtAm: p.merged_at, zurueckgenommenAm: spaeter(/^revert/i), repariertAm: spaeter(/^fix/i) });
    }
  }
  return aus;
}

async function main() {
  const jetzt = Date.now();
  const woche = wochenStart(jetzt);
  const zeilen = wochenZeilen(woche, await einheiten(), await kosten(new Date(Date.parse(woche)).toISOString()), await aenderungen(Date.parse(woche))).map((z) => ({ produkt: PRODUKT, ...z, aktualisiert_at: new Date().toISOString() }));
  console.log(JSON.stringify({ woche, zeilen }, null, 2));
  if (DRY || zeilen.length === 0) return;
  const res = await fetch(`${url}/rest/v1/kennzahlen_woche?on_conflict=produkt,kennzahl,woche`, {
    method: "POST",
    headers: { ...sbKopf, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(zeilen),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`kennzahlen_woche schreiben: ${res.status} ${await res.text()}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
