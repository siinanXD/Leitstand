import { letzteJeProdukt, type Zeile } from "./ceo/ceo";
import { parseEvents, parseSnapshot, type Quelle } from "./uebersicht";

export type Laden = { zustand: "ok"; quelle: Quelle } | { zustand: "fehler" };

type Antwort = PromiseLike<{ data: unknown; error: unknown }>;
type Kette = Antwort & { eq(spalte: string, wert: string): Kette; gte(spalte: string, wert: string): Kette; order(spalte: string, opt: { ascending: boolean }): Kette; limit(n: number): Kette; range(von: number, bis: number): Kette };

/** Der Teil des Supabase-Clients, den die Datenschicht braucht (für Tests ersetzbar). */
export type Lesequelle = { from(tabelle: string): { select(spalten: string): Kette } };

const SEITE = 1000;
const MAX_SEITEN = 50;

/** Seitenweise laden (SIN-499): Supabase kappt eine Antwort bei `max_rows` (1000). */
async function alleSeiten(seite: (von: number, bis: number) => Kette): Promise<{ data: unknown[]; error: unknown }> {
  const alle: unknown[] = [];
  for (let i = 0; i < MAX_SEITEN; i++) {
    const r = await seite(i * SEITE, (i + 1) * SEITE - 1);
    if (r.error) return { data: [], error: r.error };
    const zeilen = Array.isArray(r.data) ? r.data : [];
    alle.push(...zeilen);
    if (zeilen.length < SEITE) break;
  }
  return { data: alle, error: null };
}

/** Alle Ereignisse einer Aufgabe (SIN-556); `parseMeldungen` liest die Rollen aus `payload`. Nur Supabase, kein GitHub. */
export async function ladeAufgabe(client: Lesequelle, issue: string): Promise<unknown[] | null> {
  try {
    const r = await alleSeiten((von, bis) => client.from("loop_events").select("*").eq("issue", issue).order("created_at", { ascending: true }).order("id", { ascending: true }).range(von, bis));
    return r.error ? null : r.data;
  } catch {
    return null;
  }
}

/** Letzte Entscheidung je Produkt aus `ceo_entscheidungen` (SIN-579); Fehler: null. */
export async function ladeChef(client: Lesequelle): Promise<Zeile[] | null> {
  try {
    const r = await client.from("ceo_entscheidungen").select("produkt, entscheidung, grund, created_at, bezug").order("created_at", { ascending: false }).limit(50);
    return r.error ? null : letzteJeProdukt(r.data);
  } catch {
    return null;
  }
}

/** Lesen mit der Sitzung des Nutzers; RLS (`leitstand_nutzer`) entscheidet, was ankommt. */
export async function ladeQuelle(client: Lesequelle, jetzt = new Date()): Promise<Laden> {
  const ab = new Date(jetzt.getTime() - 24 * 3_600_000).toISOString();
  try {
    const snapshotAnfrage = client.from("loop_snapshot").select("*").limit(200);
    const [events, snapshot] = await Promise.all([
      alleSeiten((von, bis) => client.from("loop_events").select("*").gte("created_at", ab).order("created_at", { ascending: false }).order("id", { ascending: false }).range(von, bis)),
      snapshotAnfrage,
    ]);
    if (events.error || snapshot.error) return { zustand: "fehler" };
    return { zustand: "ok", quelle: { events: parseEvents(events.data), snapshot: parseSnapshot(snapshot.data) } };
  } catch {
    return { zustand: "fehler" };
  }
}
