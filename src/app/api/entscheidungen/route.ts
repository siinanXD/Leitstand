import { antwortEingabe, beantworte, entscheidungZeile, offeneEntscheidungen } from "@/lib/entscheidung/entscheidung";
import { entscheidungsNetz } from "@/lib/entscheidung/netz";
import { protokolliere, verweigert } from "@/lib/server-nutzer";

export const dynamic = "force-dynamic";

const antwort = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Offene Linear-Issues mit Label `entscheidung` samt gelesenem Block. */
export async function GET(anfrage: Request) {
  const nein = await verweigert(anfrage);
  if (nein) return nein;
  const key = process.env.LINEAR_API_KEY;
  if (!key) return antwort(503, { fehler: "LINEAR_API_KEY fehlt" });
  try {
    return antwort(200, { entscheidungen: await offeneEntscheidungen(entscheidungsNetz(key)) });
  } catch {
    return antwort(502, { fehler: "linear" });
  }
}

/** Antwort `{issue, option | text}`: Kommentar nach Linear, Issue zurück in die Schlange, protokolliert in loop_events. */
export async function POST(anfrage: Request) {
  const nein = await verweigert(anfrage);
  if (nein) return nein;
  const eingabe = antwortEingabe(await anfrage.json().catch(() => null));
  if (!eingabe) return antwort(400, { fehler: "Kennung und genau eine Wahl (option oder text) nötig" });
  const key = process.env.LINEAR_API_KEY;
  if (!key) return antwort(503, { fehler: "LINEAR_API_KEY fehlt" });
  const ergebnis = await beantworte(entscheidungsNetz(key), eingabe);
  const protokolliert = await protokolliere(entscheidungZeile(eingabe.issue, ergebnis));
  if (!ergebnis.ok) return antwort(ergebnis.grund === "linear" ? 502 : 409, { fehler: ergebnis.grund, protokolliert });
  return antwort(200, { kennung: ergebnis.kennung, wahl: ergebnis.wahl, protokolliert });
}
