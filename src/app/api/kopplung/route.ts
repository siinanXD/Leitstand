import { erzeugeKopplung, kopplungsZeile } from "@/lib/kopplung/kopplung";
import { hashedToken, supabaseSpeicher } from "@/lib/kopplung/server";
import { leitstandNutzer, protokolliere } from "@/lib/server-nutzer";

export const dynamic = "force-dynamic";

const antwort = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Kopplungscode erzeugen: nur mit gültiger Sitzung und Eintrag in `leitstand_nutzer`. */
export async function POST(anfrage: Request) {
  const nutzer = await leitstandNutzer(anfrage);
  if (!nutzer) return antwort(401, { fehler: "nicht angemeldet" });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return antwort(503, { fehler: "Kopplung nicht konfiguriert" });
  try {
    const token = await hashedToken(url, key, nutzer.email);
    const kopplung = token ? await erzeugeKopplung(supabaseSpeicher(url, key), token, key) : null;
    if (!kopplung) {
      await protokolliere(kopplungsZeile("fehler"));
      return antwort(502, { fehler: "Code konnte nicht erzeugt werden" });
    }
    await protokolliere(kopplungsZeile("ok"));
    return antwort(200, { code: kopplung.code, gueltigBis: kopplung.gueltigBis.toISOString() });
  } catch {
    return antwort(502, { fehler: "Code konnte nicht erzeugt werden" });
  }
}
