/** Sitzung für das Agent-Testkonto ohne Passwort (SIN-913): Magic-Link per Admin-API erzeugen, per verifyOtp einlösen, als Playwright-`storageState` bauen. */
type Sitzung = { access_token: string; refresh_token: string; token_type: string; expires_in: number; expires_at?: number; user: unknown };

export type AdminClient = {
  auth: { admin: { generateLink(a: { type: "magiclink"; email: string }): PromiseLike<{ data: { properties?: { hashed_token?: string } | null } | null; error: unknown }> } };
};
export type AnonClient = {
  auth: { verifyOtp(a: { token_hash: string; type: "magiclink" }): PromiseLike<{ data: { session: Sitzung | null } | null; error: unknown }> };
};

export type StorageState = { cookies: []; origins: { origin: string; localStorage: { name: string; value: string }[] }[] };

/** Schlüssel, unter dem supabase-js die Sitzung im Browser ablegt: `sb-<erstes Hostlabel>-auth-token`. */
export type KontoClient = {
  auth: {
    admin: {
      createUser(a: { email: string; email_confirm: boolean; app_metadata: Record<string, unknown> }): PromiseLike<{ data: { user: { id: string } | null } | null; error: { message: string } | null }>;
      listUsers(a: { page: number; perPage: number }): PromiseLike<{ data: { users: { id: string; email?: string; app_metadata?: Record<string, unknown> }[] } | null; error: { message: string } | null }>;
    };
  };
  from(t: string): { upsert(row: Record<string, unknown>, o: { onConflict: string }): PromiseLike<{ error: { message: string } | null }> };
};

/**
 * Konto idempotent anlegen oder finden; Zeile in leitstand_nutzer wird immer gesetzt (die RLS-Sperren hängen am Marker).
 * Ein bestehendes Konto zählt nur, wenn es den Marker `agent_testnutzer` schon beim Anlegen bekommen hat: der Marker wird nie
 * nachträglich auf ein fremdes Konto gesetzt, sonst könnte eine falsch konfigurierte Adresse eine Magic-Link-Sitzung
 * für ein echtes Konto erzeugen (Prüfer-Fund SIN-913).
 */
export async function stelleKontoSicher(admin: KontoClient, email: string): Promise<string> {
  const marker = { agent_testnutzer: true };
  const neu = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: marker });
  let id = neu.data?.user?.id;
  if (!id) {
    if (neu.error && !/already|registered|exists/i.test(neu.error.message)) throw new Error(`Konto nicht angelegt: ${neu.error.message}`);
    for (let page = 1; !id; page++) {
      const liste = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (liste.error) throw new Error(`Konten nicht gelesen: ${liste.error.message}`);
      const users = liste.data?.users ?? [];
      const konto = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (konto && konto.app_metadata?.agent_testnutzer !== true) throw new Error("Adresse gehört einem bestehenden Konto ohne Marker agent_testnutzer; Abbruch (kein fremdes Konto übernehmen)");
      id = konto?.id;
      if (!id && users.length < 1000) throw new Error("Testkonto nicht gefunden");
    }
  }
  const zeile = await admin.from("leitstand_nutzer").upsert({ user_id: id }, { onConflict: "user_id" });
  if (zeile.error) throw new Error(`leitstand_nutzer nicht geschrieben: ${zeile.error.message}`);
  return id;
}

export const speicherSchluessel = (supabaseUrl: string) => `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;

export async function baueStorageState(admin: AdminClient, anon: AnonClient, email: string, supabaseUrl: string, leitstandUrl: string): Promise<StorageState> {
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const hash = link.data?.properties?.hashed_token;
  if (link.error || !hash) throw new Error("Magic-Link für das Testkonto nicht erzeugt");
  const { data, error } = await anon.auth.verifyOtp({ token_hash: hash, type: "magiclink" });
  if (error || !data?.session) throw new Error("Sitzung für das Testkonto nicht eingelöst");
  return { cookies: [], origins: [{ origin: new URL(leitstandUrl).origin, localStorage: [{ name: speicherSchluessel(supabaseUrl), value: JSON.stringify(data.session) }] }] };
}
