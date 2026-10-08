import { parseEvents, parseSnapshot, type Quelle } from "./uebersicht";

export type Laden = { zustand: "ok"; quelle: Quelle } | { zustand: "fehler" };

type Antwort = PromiseLike<{ data: unknown; error: unknown }>;
type Kette = Antwort & { gte(spalte: string, wert: string): Kette; order(spalte: string, opt: { ascending: boolean }): Kette; limit(n: number): Kette };

/** Der Teil des Supabase-Clients, den die Datenschicht braucht (für Tests ersetzbar). */
export type Lesequelle = { from(tabelle: string): { select(spalten: string): Kette } };

/** Lesen mit der Sitzung des Nutzers; RLS (`leitstand_nutzer`) entscheidet, was ankommt. */
export async function ladeQuelle(client: Lesequelle, jetzt = new Date()): Promise<Laden> {
  const ab = new Date(jetzt.getTime() - 24 * 3_600_000).toISOString();
  try {
    const [events, snapshot] = await Promise.all([
      client.from("loop_events").select("*").gte("created_at", ab).order("created_at", { ascending: false }).limit(1000),
      client.from("loop_snapshot").select("*").limit(200),
    ]);
    if (events.error || snapshot.error) return { zustand: "fehler" };
    return { zustand: "ok", quelle: { events: parseEvents(events.data), snapshot: parseSnapshot(snapshot.data) } };
  } catch {
    return { zustand: "fehler" };
  }
}
