import { speichereAbo } from "@/lib/push/push";
import { supabaseSpeicher } from "@/lib/push/server";
import { verweigert } from "@/lib/server-nutzer";

export const dynamic = "force-dynamic";

const antwort = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function speicher() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? supabaseSpeicher(url, key) : null;
}

/** Öffentlicher VAPID-Schlüssel für `pushManager.subscribe` (nur mit Sitzung). */
export async function GET(anfrage: Request) {
  const nein = await verweigert(anfrage);
  if (nein) return nein;
  const key = process.env.VAPID_PUBLIC_KEY;
  return key ? antwort(200, { publicKey: key }) : antwort(503, { fehler: "Push nicht konfiguriert" });
}

/** Abo speichern. */
export async function POST(anfrage: Request) {
  const nein = await verweigert(anfrage);
  if (nein) return nein;
  const db = speicher();
  if (!db) return antwort(503, { fehler: "Push nicht konfiguriert" });
  const body: unknown = await anfrage.json().catch(() => null);
  try {
    return (await speichereAbo(db, body)) ? antwort(200, { ok: true }) : antwort(400, { fehler: "Abo ungültig" });
  } catch {
    return antwort(502, { fehler: "Abo konnte nicht gespeichert werden" });
  }
}

/** Abo löschen (Schalter aus). */
export async function DELETE(anfrage: Request) {
  const nein = await verweigert(anfrage);
  if (nein) return nein;
  const db = speicher();
  if (!db) return antwort(503, { fehler: "Push nicht konfiguriert" });
  const body: unknown = await anfrage.json().catch(() => null);
  const endpoint = body && typeof body === "object" ? (body as { endpoint?: unknown }).endpoint : null;
  if (typeof endpoint !== "string" || !endpoint) return antwort(400, { fehler: "endpoint fehlt" });
  try {
    await db.loeschen(endpoint);
    return antwort(200, { ok: true });
  } catch {
    return antwort(502, { fehler: "Abo konnte nicht gelöscht werden" });
  }
}
