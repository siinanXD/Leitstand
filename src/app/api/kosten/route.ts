import { ladeKosten } from "@/lib/kosten/server";
import { leitstandNutzer } from "@/lib/server-nutzer";

export const dynamic = "force-dynamic";

const antwort = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Kosten heute und Monat: nur mit Sitzung und Zeile in `leitstand_nutzer`. */
export async function GET(anfrage: Request) {
  if (!(await leitstandNutzer(anfrage))) return antwort(401, { fehler: "nicht angemeldet" });
  return antwort(200, await ladeKosten());
}
