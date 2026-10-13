import { createClient } from "@supabase/supabase-js";
import { leitstandNutzer } from "@/lib/server-nutzer";
import { zeilen } from "@/lib/werkzeuge/werkzeuge";

export const dynamic = "force-dynamic";

const antwort = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Status der Werkzeuge: nur mit Sitzung und Zeile in `leitstand_nutzer`. Gelesen wird, was das Prüfskript gespeichert hat. */
export async function GET(anfrage: Request) {
  if (!(await leitstandNutzer(anfrage))) return antwort(401, { fehler: "nicht angemeldet" });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return antwort(503, { fehler: "Datenquelle nicht konfiguriert" });
  const { data, error } = await createClient(url, key, { auth: { persistSession: false } }).from("leitstand_werkzeug_status").select("*");
  return error ? antwort(502, { fehler: "Datenquelle nicht erreichbar" }) : antwort(200, zeilen(data));
}
