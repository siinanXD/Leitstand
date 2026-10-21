import { pauseEingabe, pauseStand, pauseZeile, PAUSE_SCHRITT } from "@/lib/pause";
import { leitstandNutzer, protokolliere } from "@/lib/server-nutzer";

export const dynamic = "force-dynamic";

const antwort = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Jüngste PAUSE-Ereignisse aus `loop_events` (ohne 24-h-Grenze, eine Pause kann länger dauern). Null, wenn nicht lesbar. */
async function ladeStand() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/loop_events?select=step,status,grund,created_at&step=ilike.${PAUSE_SCHRITT}&order=created_at.desc&limit=20`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
    return res.ok ? pauseStand((await res.json()) as Parameters<typeof pauseStand>[0]) : null;
  } catch {
    return null;
  }
}

/** Lesen: ist der Loop pausiert, und seit wann. */
export async function GET(anfrage: Request) {
  if (!(await leitstandNutzer(anfrage))) return antwort(401, { fehler: "nicht angemeldet" });
  const stand = await ladeStand();
  return stand ? antwort(200, stand) : antwort(503, { fehler: "Pausenstand nicht lesbar" });
}

/** Pause setzen oder aufheben: schreibt das PAUSE-Ereignis, das `dispatch` liest. Ohne Protokoll gilt die Aktion als fehlgeschlagen. */
export async function POST(anfrage: Request) {
  if (!(await leitstandNutzer(anfrage))) return antwort(401, { fehler: "nicht angemeldet" });
  const pausiert = pauseEingabe(await anfrage.json().catch(() => null));
  if (pausiert === null) return antwort(400, { fehler: "pausiert muss true oder false sein" });
  if (!(await protokolliere(pauseZeile(pausiert)))) return antwort(502, { fehler: "loop_events nicht beschreibbar" });
  const stand = await ladeStand();
  return antwort(200, stand ?? (pausiert ? { pausiert: true, seit: new Date().toISOString() } : { pausiert: false }));
}
