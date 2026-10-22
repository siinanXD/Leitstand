import { createClient } from "@supabase/supabase-js";
import { aktionsStatus } from "./agent-testnutzer/aktion";

/**
 * Nur Sinan (und das Agent-Testkonto, SIN-913): gültige Sitzung und eine Zeile in `leitstand_nutzer`, die RLS dem Nutzer zeigt.
 * Gibt E-Mail und den Marker `app_metadata.agent_testnutzer` zurück, sonst null.
 */
export async function leitstandNutzer(anfrage: Request): Promise<{ email: string; agent?: boolean } | null> {
  const token = /^Bearer (.+)$/.exec(anfrage.headers.get("authorization") ?? "")?.[1];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return null;
  try {
    const client = createClient(url, key, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: nutzer, error } = await client.auth.getUser(token);
    if (error || !nutzer.user?.email) return null;
    const { data, error: lesefehler } = await client.from("leitstand_nutzer").select("*").limit(1);
    if (lesefehler || !Array.isArray(data) || data.length === 0) return null;
    return { email: nutzer.user.email, agent: nutzer.user.app_metadata?.agent_testnutzer === true };
  } catch {
    return null;
  }
}

/** Zeile in `loop_events` schreiben (nur mit Service-Role-Key, serverseitig). Gibt zurück, ob geschrieben wurde. */
export async function protokolliere(zeile: object): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/rest/v1/loop_events`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(zeile),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Zugang für API-Routen: null = erlaubt, sonst die fertige Antwort (401 ohne Nutzer; 403 samt Protokoll, wenn das Agent-Testkonto (SIN-913) eine Aktion auslösen will). */
export async function verweigert(anfrage: Request): Promise<Response | null> {
  return pruefeNutzer(anfrage, await leitstandNutzer(anfrage));
}

/** Wie `verweigert`, für Routen, die den Nutzer schon geladen haben. */
export async function pruefeNutzer(anfrage: Request, nutzer: { email: string; agent?: boolean } | null): Promise<Response | null> {
  const kopf = { "Cache-Control": "no-store" };
  if (!nutzer) return Response.json({ fehler: "nicht angemeldet" }, { status: 401, headers: kopf });
  if (aktionsStatus(nutzer.email, anfrage.method, process.env.AGENT_TESTNUTZER_EMAIL, nutzer.agent === true) === 200) return null;
  await protokolliere({ project: "leitstand", step: "agent-testnutzer", status: "fehler", grund: `Aktion abgelehnt: ${anfrage.method} ${new URL(anfrage.url).pathname}` });
  return Response.json({ fehler: "Das Testkonto darf nur lesen" }, { status: 403, headers: kopf });
}
