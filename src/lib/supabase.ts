import { parseEvents, parseSnapshot, type Quelle } from "./uebersicht";

export type Laden = { zustand: "ok"; quelle: Quelle } | { zustand: "nicht-konfiguriert" } | { zustand: "fehler" };

type Env = Record<string, string | undefined>;

/** Lesezugriff über PostgREST mit dem öffentlichen Anon-Key (RLS schützt die Tabellen). */
export async function ladeQuelle(env: Env = process.env, fetchFn: typeof fetch = fetch, jetzt = new Date()): Promise<Laden> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { zustand: "nicht-konfiguriert" };
  const kopf = { apikey: key, Authorization: `Bearer ${key}` };
  const ab = new Date(jetzt.getTime() - 24 * 3_600_000).toISOString();
  const get = async (pfad: string) => {
    const res = await fetchFn(`${url.replace(/\/$/, "")}/rest/v1/${pfad}`, { headers: kopf, cache: "no-store" });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    return res.json() as Promise<unknown>;
  };
  try {
    const [events, snapshot] = await Promise.all([
      get(`loop_events?select=*&created_at=gte.${encodeURIComponent(ab)}&order=created_at.desc&limit=1000`),
      get("loop_snapshot?select=*&limit=200"),
    ]);
    return { zustand: "ok", quelle: { events: parseEvents(events), snapshot: parseSnapshot(snapshot) } };
  } catch {
    return { zustand: "fehler" };
  }
}
