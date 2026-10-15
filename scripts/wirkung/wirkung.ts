/**
 * Auto-Pause der Rollen (SIN-637). Aufruf aus .github/workflows/wirkung.yml (täglich):
 *
 *   npx tsx scripts/wirkung/wirkung.ts
 *
 * Liest `loop_events` der letzten 14 Tage und alle Pause-Ereignisse, pausiert jede Rolle ohne Wirkung in 14 Tagen
 * (`src/lib/wirkung/wirkung.ts`) und schreibt dafür ein Ereignis ROLLE_PAUSE. Der Push an Sinan kommt von
 * `scripts/push/ausloeser.ts` (Alarm mit Begründung). Wieder angeschaltet wird per Knopf unter „Mein Team“.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. DRY_RUN=1: nur Ausgabe, nichts geschrieben.
 */
import { readFileSync } from "node:fs";
import { pauseZeile, PAUSE_NACH_MS, zuPausieren, type RollenEreignis } from "../../src/lib/wirkung/wirkung";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const rollen = (JSON.parse(readFileSync("docs/autonomy/agents.json", "utf8")) as { rollen: { id: string; name: string }[] }).rollen;

async function main() {
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = env;
  if (!url || !key) return console.log("::warning::SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt, nichts zu tun.");
  const kopf = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const ab = new Date(Date.now() - PAUSE_NACH_MS).toISOString();
  const res = await fetch(`${url}/rest/v1/loop_events?select=agent,step,status,created_at,wirkung&or=(created_at.gte.${ab},step.eq.ROLLE_PAUSE)&agent=in.(${rollen.map((r) => r.id).join(",")})&order=created_at.desc&limit=5000`, { headers: kopf, signal: AbortSignal.timeout(20_000) });
  // Ohne lesbare Ereignisse (z. B. Spalte `wirkung` fehlt, Migration offen) wird nie pausiert: lieber nichts tun als zu Unrecht abschalten.
  if (!res.ok) throw new Error(`loop_events nicht lesbar: HTTP ${res.status}`);
  const ids = zuPausieren(rollen, (await res.json()) as RollenEreignis[], Date.now());
  console.log(`${DRY ? "[trocken] " : ""}Zu pausieren: ${ids.length > 0 ? ids.join(", ") : "keine"}`);
  if (DRY) return;
  for (const id of ids) {
    const schreiben = await fetch(`${url}/rest/v1/loop_events`, { method: "POST", headers: kopf, body: JSON.stringify(pauseZeile(id, rollen.find((r) => r.id === id)!.name)), signal: AbortSignal.timeout(20_000) });
    if (!schreiben.ok) throw new Error(`Pause für ${id} nicht geschrieben: HTTP ${schreiben.status}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
