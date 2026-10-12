import { kopplungsZeile, loeseKopplungEin } from "@/lib/kopplung/kopplung";
import { supabaseSpeicher } from "@/lib/kopplung/server";
import { protokolliere } from "@/lib/server-nutzer";

export const dynamic = "force-dynamic";

const antwort = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Kopplungscode gegen `token_hash` tauschen (ohne Sitzung, die App hat noch keine). Schutz: höchstens 5 Fehlversuche je 10 Minuten. */
export async function POST(anfrage: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return antwort(503, { fehler: "Kopplung nicht konfiguriert" });
  const body: unknown = await anfrage.json().catch(() => null);
  const eingabe = body && typeof body === "object" ? (body as Record<string, unknown>).code : null;
  try {
    const ergebnis = await loeseKopplungEin(supabaseSpeicher(url, key), eingabe, key);
    if (ergebnis.ok) {
      await protokolliere(kopplungsZeile("ok"));
      return antwort(200, { token_hash: ergebnis.tokenHash });
    }
    if (ergebnis.grund === "format") return antwort(400, { fehler: "ungueltig" });
    await protokolliere(kopplungsZeile(ergebnis.grund === "gesperrt" ? "gesperrt" : "fehler"));
    return antwort(ergebnis.grund === "gesperrt" ? 429 : 400, { fehler: ergebnis.grund });
  } catch {
    return antwort(502, { fehler: "Kopplung nicht möglich" });
  }
}
