import { TESTNACHRICHT, sendeAnAlle } from "@/lib/push/push";
import { supabaseSpeicher, vapidSender } from "@/lib/push/server";
import { leitstandNutzer } from "@/lib/server-nutzer";

export const dynamic = "force-dynamic";

const antwort = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Testmitteilung an alle gespeicherten Abos; abgelaufene werden dabei gelöscht. */
export async function POST(anfrage: Request) {
  if (!(await leitstandNutzer(anfrage))) return antwort(401, { fehler: "nicht angemeldet" });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sender = vapidSender();
  if (!url || !key || !sender) return antwort(503, { fehler: "Push nicht konfiguriert" });
  try {
    const ergebnis = await sendeAnAlle(supabaseSpeicher(url, key), sender, TESTNACHRICHT);
    return antwort(ergebnis.gesendet > 0 ? 200 : 409, ergebnis);
  } catch {
    return antwort(502, { fehler: "Senden fehlgeschlagen" });
  }
}
