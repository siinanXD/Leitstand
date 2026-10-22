import { bestaetigung, ideeAnlegen, ideeEingabe, ideeZeile, linearNetz } from "@/lib/idee";
import { protokolliere, verweigert } from "@/lib/server-nutzer";

export const dynamic = "force-dynamic";

const antwort = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Neue Idee: legt ein Linear-Issue an (Label idee, Meilenstein v2 Ideen; dringend: v1, Todo) und protokolliert in loop_events. */
export async function POST(anfrage: Request) {
  const nein = await verweigert(anfrage);
  if (nein) return nein;
  const eingabe = ideeEingabe(await anfrage.json().catch(() => null));
  if (!eingabe) return antwort(400, { fehler: "Projekt oder Satz ungültig" });
  const key = process.env.LINEAR_API_KEY;
  if (!key) return antwort(503, { fehler: "LINEAR_API_KEY fehlt" });
  const ergebnis = await ideeAnlegen(linearNetz(key), eingabe);
  const protokolliert = await protokolliere(ideeZeile(eingabe.projekt, ergebnis));
  if (!ergebnis.ok) return antwort(ergebnis.grund === "linear" ? 502 : 409, { fehler: ergebnis.grund, protokolliert });
  return antwort(200, { kennung: ergebnis.kennung, url: ergebnis.url, meldung: bestaetigung(ergebnis.dringend), protokolliert });
}
