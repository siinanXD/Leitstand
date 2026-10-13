// Supabase Realtime auf loop_events, loop_snapshot und ceo_entscheidungen (SIN-526, SIN-579). RLS bleibt: der Kanal läuft mit der Sitzung des Nutzers.
import { parseEvents, type LoopEvent, type Quelle } from "./uebersicht";

type Filter = { event: "INSERT" | "UPDATE"; schema: string; table: string };
type Kanal = { on(art: "postgres_changes", filter: Filter, rueckruf: (nutzlast: { new: unknown }) => void): Kanal; subscribe(): Kanal };

/** Der Teil des Supabase-Clients, den die Echtzeit braucht (für Tests ersetzbar). */
export type Echtzeitquelle = { channel(name: string): Kanal; removeChannel(kanal: Kanal): unknown };

/** Hört auf neue Zeilen in loop_events; `beiAenderung` meldet, dass sich loop_snapshot (UPDATE) oder ceo_entscheidungen (INSERT) geändert hat, damit der Aufrufer neu lädt.
 *  Gibt die Abmeldung zurück. Unlesbare Zeilen fallen weg. */
export function hoereAufEreignisse(client: Echtzeitquelle, bei: (e: LoopEvent) => void, beiAenderung?: (tabelle: "loop_snapshot" | "ceo_entscheidungen") => void): () => void {
  const kanal = client
    .channel("loop_events_einfach")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "loop_events" }, (nutzlast) => {
      for (const e of parseEvents([nutzlast.new])) bei(e);
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "loop_snapshot" }, () => beiAenderung?.("loop_snapshot"))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "ceo_entscheidungen" }, () => beiAenderung?.("ceo_entscheidungen"))
    .subscribe();
  return () => void client.removeChannel(kanal);
}

/** Neues Ereignis in die Quelle legen (jüngstes zuerst); gleiche `id` zählt nur einmal. */
export function mitEreignis(q: Quelle, e: LoopEvent): Quelle {
  return q.events.some((x) => x.id === e.id) ? q : { ...q, events: [e, ...q.events] };
}
