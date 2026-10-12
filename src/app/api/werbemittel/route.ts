import { leitstandNutzer, protokolliere } from "@/lib/server-nutzer";
import { entscheide, leseEingabe, protokollZeile } from "@/lib/werbemittel";
import { wartendeWerbemittel, werbemittelSpeicher } from "@/lib/werbemittel-server";

export const dynamic = "force-dynamic";

const antwort = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Lesen: Werbemittel, die auf Freigabe warten. Nur für Sinan. */
export async function GET(anfrage: Request) {
  if (!(await leitstandNutzer(anfrage))) return antwort(401, { fehler: "nicht angemeldet" });
  try {
    const eintraege = await wartendeWerbemittel();
    if (!eintraege) return antwort(503, { fehler: "SUPABASE_SERVICE_ROLE_KEY fehlt" });
    return antwort(200, { eintraege });
  } catch {
    return antwort(502, { fehler: "Werbemittel nicht ladbar" });
  }
}

/** Freigeben oder Ablehnen mit Grund, serverseitig mit Service-Role-Key, danach Eintrag in loop_events. */
export async function POST(anfrage: Request) {
  if (!(await leitstandNutzer(anfrage))) return antwort(401, { fehler: "nicht angemeldet" });
  const eingabe = leseEingabe(await anfrage.json().catch(() => null));
  if (!eingabe) return antwort(400, { fehler: "id, aktion oder grund ungültig" });
  const speicher = werbemittelSpeicher();
  if (!speicher) return antwort(503, { fehler: "SUPABASE_SERVICE_ROLE_KEY fehlt" });
  const ergebnis = await entscheide(speicher, eingabe.id, eingabe.aktion);
  const protokolliert = await protokolliere(protokollZeile(ergebnis));
  if (!ergebnis.ok) return antwort(ergebnis.grund === "speicher" ? 502 : 409, { fehler: ergebnis.grund, protokolliert });
  return antwort(200, { status: ergebnis.status, protokolliert });
}
