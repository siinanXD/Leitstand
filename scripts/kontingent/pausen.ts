// Netz für Kontingent-Pausen (SIN-581): Tabelle `kontingent_pausen` lesen und schreiben, Ereignis in `loop_events`.
// Ohne SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY: nur Warnung, nie Abbruch (wie scripts/loop/loop.ts).
import { kontingentEreignis, type Dienst, type Pause } from "../../src/lib/kontingent/kontingent";
import { restProzent } from "../../src/lib/kontingent/prioritaet";
import { kontingente, parseSnapshot } from "../../src/lib/uebersicht";

const env = process.env;
const DRY = () => env.DRY_RUN === "1";

const kopf = () => ({ apikey: env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" });
export const hatSupabase = () => Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

/** Offene Pausen (noch nicht geweckt). Lesefehler: leere Liste mit Warnung, damit ein Ausfall nichts blockiert. */
export async function ladeOffenePausen(): Promise<Pause[]> {
  if (!hatSupabase()) return [];
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/kontingent_pausen?geweckt_at=is.null&order=bis.asc&limit=200`, { headers: kopf(), signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as Pause[];
  } catch (e) {
    console.log(`::warning::kontingent_pausen nicht lesbar (${(e as Error).message}), es läuft weiter.`);
    return [];
  }
}

/** Pausen der letzten 24 Stunden, auch schon geweckte: der Wächter erkennt daran Läufe, die am Limit scheiterten. */
export async function ladePausenAlle(): Promise<Pause[]> {
  if (!hatSupabase()) return [];
  try {
    const seit = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/kontingent_pausen?erstellt_at=gte.${seit}&order=erstellt_at.desc&limit=200`, { headers: kopf(), signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as Pause[];
  } catch (e) {
    console.log(`::warning::kontingent_pausen nicht lesbar (${(e as Error).message}), es läuft weiter.`);
    return [];
  }
}

export async function schreibePause(p: { dienst: Dienst; bis: Date; grund: string; repo: string | null }): Promise<void> {
  if (!hatSupabase()) return void console.log("::warning::Pause nicht gespeichert: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt.");
  if (DRY()) return;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/kontingent_pausen`, { method: "POST", headers: kopf(), body: JSON.stringify({ ...p, bis: p.bis.toISOString() }) });
  if (!res.ok) console.log(`::warning::Pause nicht gespeichert: ${res.status} ${await res.text()}`);
}

export async function markiereGeweckt(id: number): Promise<void> {
  if (!hatSupabase() || DRY()) return;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/kontingent_pausen?id=eq.${id}`, { method: "PATCH", headers: kopf(), body: JSON.stringify({ geweckt_at: new Date().toISOString() }) });
  if (!res.ok) console.log(`::warning::Pause ${id} nicht als geweckt markiert: ${res.status}`);
}

/** Ereignis in loop_events (Projekt `leitstand`). Das Wort steht im Schritt: `kontingent`; Status und Grund aus `kontingentEreignis` (SIN-903). */
export async function ereignis(status: "uebersprungen", grund: string): Promise<void>;
export async function ereignis(status: "pause" | "wieder-da"): Promise<void>;
export async function ereignis(status: "pause" | "wieder-da" | "uebersprungen", grund?: string): Promise<void> {
  if (!hatSupabase() || DRY()) return;
  const repo = env.GITHUB_REPOSITORY ?? "siinanXD/Leitstand";
  const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${repo}/actions/runs/${env.GITHUB_RUN_ID}` : null;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events`, {
    method: "POST",
    headers: kopf(),
    body: JSON.stringify({ project: "leitstand", step: "kontingent", ...kontingentEreignis(status, grund), issue: null, pr: null, run_id: env.GITHUB_RUN_ID ?? null, run_url: runUrl }),
  }).catch((e: Error) => ({ ok: false, status: 0, text: async () => e.message }));
  if (!res.ok) console.log(`::warning::loop_event nicht geschrieben: ${res.status} ${await res.text()}`);
}

/** Geschätzter Claude-Rest in Prozent aus `loop_snapshot` (SIN-633); ohne Daten oder bei Lesefehler null, das bremst nichts. */
export async function ladeClaudeRest(): Promise<number | null> {
  if (!hatSupabase()) return null;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_snapshot?select=*`, { headers: kopf(), signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(String(res.status));
    return restProzent(kontingente(parseSnapshot(await res.json())));
  } catch (e) {
    console.log(`::warning::loop_snapshot nicht lesbar (${(e as Error).message}), Kontingent unbekannt.`);
    return null;
  }
}
