import { createClient } from "@supabase/supabase-js";
import { modell } from "@/lib/datenbank/datenbank";
import { leitstandNutzer } from "@/lib/server-nutzer";

export const dynamic = "force-dynamic";

const antwort = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Struktur der Datenbank (nur Katalog, keine Inhalte): nur mit Sitzung und Zeile in `leitstand_nutzer`. */
export async function GET(anfrage: Request) {
  if (!(await leitstandNutzer(anfrage))) return antwort(401, { fehler: "nicht angemeldet" });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return antwort(503, { fehler: "Datenquelle nicht konfiguriert" });
  const { data, error } = await createClient(url, key, { auth: { persistSession: false } }).rpc("leitstand_schema");
  return error ? antwort(502, { fehler: "Datenquelle nicht erreichbar" }) : antwort(200, { tabellen: modell(data) });
}
