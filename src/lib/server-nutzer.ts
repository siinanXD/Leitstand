import { createClient } from "@supabase/supabase-js";

/** Nur Sinan: gültige Sitzung und eine Zeile in `leitstand_nutzer`, die RLS dem Nutzer zeigt. Gibt dessen E-Mail-Adresse zurück, sonst null. */
export async function leitstandNutzer(anfrage: Request): Promise<{ email: string } | null> {
  const token = /^Bearer (.+)$/.exec(anfrage.headers.get("authorization") ?? "")?.[1];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return null;
  try {
    const client = createClient(url, key, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: nutzer, error } = await client.auth.getUser(token);
    if (error || !nutzer.user?.email) return null;
    const { data, error: lesefehler } = await client.from("leitstand_nutzer").select("*").limit(1);
    return !lesefehler && Array.isArray(data) && data.length > 0 ? { email: nutzer.user.email } : null;
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
