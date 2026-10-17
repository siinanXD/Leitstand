import { createClient } from "@supabase/supabase-js";
import { parseAufgaben } from "../aufgaben";
import { mitCache } from "../kosten/cache";
import { parseSnapshot } from "../uebersicht";
import { bezugVon, fliessband, parseFliessEreignisse, type Fliessband } from "./fliessband";

/** Liest Aufgaben, Snapshot und Ereignisse der letzten 3 Tage (Service-Role, nur serverseitig). Null bei Fehler. */
async function lade(): Promise<Fliessband | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const db = createClient(url, key, { auth: { persistSession: false } });
    const ab = new Date(Date.now() - 3 * 24 * 3_600_000).toISOString();
    const [aufgaben, snapshot, events] = await Promise.all([
      db.from("leitstand_aufgaben").select("*").limit(1000),
      db.from("loop_snapshot").select("*").limit(200),
      db.from("loop_events").select("*").gte("created_at", ab).order("created_at", { ascending: false }).limit(3000),
    ]);
    if (aufgaben.error || snapshot.error || events.error) return null;
    const bezug = bezugVon(aufgaben.data);
    return fliessband({ aufgaben: parseAufgaben(aufgaben.data).map((a) => ({ ...a, bezug: bezug.get(a.issue) ?? [] })), snapshot: parseSnapshot(snapshot.data), events: parseFliessEreignisse(events.data), jetzt: new Date() });
  } catch {
    return null;
  }
}

/** 60 s Cache (SIN-814: Antwort unter 2 s); bei Fehler gilt bis 10 Minuten der letzte gute Stand. */
export const ladeFliessband = mitCache(lade, 60_000, 10 * 60_000);
