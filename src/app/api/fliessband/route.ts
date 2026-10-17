import { ladeFliessband } from "@/lib/fliessband/server";
import { leitstandNutzer } from "@/lib/server-nutzer";

export const dynamic = "force-dynamic";

const antwort = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Fließband: Station, Farbe und Grund je Aufgabe aller Produkte. Nur mit Sitzung und Zeile in `leitstand_nutzer`. */
export async function GET(anfrage: Request) {
  if (!(await leitstandNutzer(anfrage))) return antwort(401, { fehler: "nicht angemeldet" });
  const daten = await ladeFliessband();
  return daten ? antwort(200, daten) : antwort(503, { fehler: "Daten nicht verfügbar" });
}
