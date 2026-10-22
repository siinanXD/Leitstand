import { PROJEKTE } from "@/lib/projekte";
import { protokolliere, verweigert } from "@/lib/server-nutzer";
import { goEingabe, SCHRITT, staende, standZeile } from "@/lib/visionaer/visionaer";

export const dynamic = "force-dynamic";

const antwort = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Jüngster Versionsstand des Produkts; null, wenn nicht lesbar. */
async function ladeStand(produkt: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/loop_events?select=project,step,status,grund,created_at&project=eq.${produkt}&step=eq.${SCHRITT}&order=created_at.desc&limit=20`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
    return res.ok ? (staende(await res.json())[0] ?? { status: "keiner" as const, name: "" }) : null;
  } catch {
    return null;
  }
}

/** Sinans „go“ für die vorgeschlagene Version: nur wenn ein Vorschlag wartet. Schreibt VERSION `go`; ohne Protokoll gilt die Aktion als fehlgeschlagen. */
export async function POST(anfrage: Request) {
  const nein = await verweigert(anfrage);
  if (nein) return nein;
  const eingabe = goEingabe(await anfrage.json().catch(() => null), PROJEKTE.map((p) => p.id));
  if (!eingabe) return antwort(400, { fehler: "Produkt oder go ungültig" });
  const stand = await ladeStand(eingabe.produkt);
  if (!stand) return antwort(503, { fehler: "Versionsstand nicht lesbar" });
  if (stand.status !== "vorschlag") return antwort(409, { fehler: "kein Vorschlag, der auf Go wartet" });
  if (!(await protokolliere(standZeile(eingabe.produkt, "go", stand.name)))) return antwort(502, { fehler: "loop_events nicht beschreibbar" });
  return antwort(200, { produkt: eingabe.produkt, status: "go" });
}
