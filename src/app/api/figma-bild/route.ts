import { knotenBild } from "@/lib/figma";
import { leseRegister } from "@/lib/figma-ansichten/figma-ansichten";
import { verweigert } from "@/lib/server-nutzer";

export const dynamic = "force-dynamic";

const fehler = (status: number, text: string) => Response.json({ fehler: text }, { status, headers: { "Cache-Control": "no-store" } });

/** PNG eines Registereintrags (`?node=21:2`, SIN-1038): nur mit Sitzung, nur Knoten aus dem Register, Token bleibt auf dem Server. 10 Min. Cache im Browser. */
export async function GET(anfrage: Request) {
  const nein = await verweigert(anfrage);
  if (nein) return nein;
  const node = new URL(anfrage.url).searchParams.get("node");
  const eintrag = leseRegister().find((a) => a.node === node);
  if (!eintrag) return fehler(404, "Unbekanntes Bild");
  try {
    const png = await knotenBild(eintrag.datei, eintrag.node, process.env, fetch);
    if (!png) return fehler(503, "Figma nicht verfügbar");
    return new Response(Buffer.from(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=600", "X-Bild-Stand": new Date().toISOString() } });
  } catch {
    return fehler(502, "Bild nicht verfügbar");
  }
}
