import registerJson from "../../../../docs/autonomy/agents.json";
import { protokolliere, verweigert } from "@/lib/server-nutzer";
import { rolleEingabe, rollenStand, weiterZeile, WOCHE_MS, type RollenEreignis } from "@/lib/wirkung/wirkung";

export const dynamic = "force-dynamic";

const ROLLEN = registerJson.rollen.map((r) => ({ id: r.id, name: r.name }));
const antwort = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Ereignisse der Rollen: 14 Tage (Pause-Ereignisse auch älter, sie gelten bis zum Gegenteil). Null, wenn nicht lesbar. */
async function lade(): Promise<RollenEreignis[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const ab = new Date(Date.now() - 2 * WOCHE_MS).toISOString();
  const filter = `or=(created_at.gte.${ab},step.eq.ROLLE_PAUSE)&agent=in.(${ROLLEN.map((r) => r.id).join(",")})`;
  try {
    const res = await fetch(`${url}/rest/v1/loop_events?select=agent,step,status,created_at,wirkung,cost:cost_usd,grund&${filter}&order=created_at.desc&limit=2000`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
    return res.ok ? ((await res.json()) as RollenEreignis[]) : null;
  } catch {
    return null;
  }
}

/** Lesen: Note, Kosten der Woche, letzter Lauf und Pause je Rolle. Fehlt die Spalte `wirkung` (Migration offen), ist die Antwort 503. */
export async function GET(anfrage: Request) {
  const nein = await verweigert(anfrage);
  if (nein) return nein;
  const events = await lade();
  return events ? antwort(200, rollenStand(ROLLEN, events, Date.now()).map((s) => ({ ...s, ...registerJson.rollen.find((r) => r.id === s.id)?.wirkung }))) : antwort(503, { fehler: "Rollen nicht lesbar" });
}

/** Wieder anschalten: schreibt das Ereignis, das die Pause aufhebt. Ohne Protokoll gilt die Aktion als fehlgeschlagen. */
export async function POST(anfrage: Request) {
  const nein = await verweigert(anfrage);
  if (nein) return nein;
  const agent = rolleEingabe(await anfrage.json().catch(() => null), ROLLEN.map((r) => r.id));
  if (!agent) return antwort(400, { fehler: "agent ist keine bekannte Rolle" });
  return (await protokolliere(weiterZeile(agent))) ? antwort(200, { agent, pausiert: false }) : antwort(502, { fehler: "loop_events nicht beschreibbar" });
}
