import { parseAufgaben } from "@/lib/aufgaben";
import { SPAETER, sofortAntwort } from "@/lib/chat/sofort";
import { protokolliere, verweigert } from "@/lib/server-nutzer";
import { parseSnapshot } from "@/lib/uebersicht";

export const dynamic = "force-dynamic";

const MAX_ZEICHEN = 2000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const antwort = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const rest = (pfad: string, init?: RequestInit) => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${pfad}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
};

async function lies(tabelle: string) {
  const res = await rest(`${tabelle}?select=*&limit=500`);
  return res.ok ? ((await res.json()) as unknown) : [];
}

async function schreibe(faden: string, rolle: "sinan" | "leitstand", text: string, bezug: object = {}) {
  return (await rest("chat_nachrichten", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ faden, rolle, text, bezug }) })).ok;
}

/** Nachricht von Sinan: speichern, Statusfragen sofort aus loop_snapshot und leitstand_aufgaben beantworten (kein Modell), alles andere mit „Ich schaue nach.“ an Chat 3 übergeben. Jede Nachricht landet in loop_events. */
export async function POST(anfrage: Request) {
  const nein = await verweigert(anfrage);
  if (nein) return nein;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return antwort(503, { fehler: "Supabase nicht eingerichtet" });
  const eingabe = (await anfrage.json().catch(() => null)) as { faden?: unknown; text?: unknown } | null;
  const text = typeof eingabe?.text === "string" ? eingabe.text.trim() : "";
  if (typeof eingabe?.faden !== "string" || !UUID.test(eingabe.faden) || text === "" || text.length > MAX_ZEICHEN) return antwort(400, { fehler: "Faden oder Text ungültig" });
  const faden = eingabe.faden;

  if (!(await schreibe(faden, "sinan", text))) return antwort(502, { fehler: "Nachricht nicht gespeichert" });
  let sofort: string | null = null;
  try {
    const [snapshot, aufgaben] = await Promise.all([lies("loop_snapshot"), lies("leitstand_aufgaben")]);
    sofort = sofortAntwort(text, { events: [], snapshot: parseSnapshot(snapshot), aufgaben: parseAufgaben(aufgaben) });
  } catch {
    // Daten nicht lesbar: lieber „Ich schaue nach.“ als eine geratene Antwort.
  }
  const gesendet = await schreibe(faden, "leitstand", sofort ?? SPAETER, { weg: sofort ? "sofort" : "weiter" });
  const protokolliert = await protokolliere({ project: "leitstand", step: "chat", status: gesendet ? "ok" : "fehler", payload: { faden, weg: sofort ? "sofort" : "weiter", zeichen: text.length } });
  if (!gesendet) return antwort(502, { fehler: "Antwort nicht gespeichert", protokolliert });
  return antwort(200, { antwort: sofort ?? SPAETER, sofort: sofort !== null, protokolliert });
}
