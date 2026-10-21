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
export const speicherSchluessel = (supabaseUrl: string) => `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;

export async function baueStorageState(admin: AdminClient, anon: AnonClient, email: string, supabaseUrl: string, leitstandUrl: string): Promise<StorageState> {
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const hash = link.data?.properties?.hashed_token;
  if (link.error || !hash) throw new Error("Magic-Link für das Testkonto nicht erzeugt");
  const { data, error } = await anon.auth.verifyOtp({ token_hash: hash, type: "magiclink" });
  if (error || !data?.session) throw new Error("Sitzung für das Testkonto nicht eingelöst");
  return { cookies: [], origins: [{ origin: new URL(leitstandUrl).origin, localStorage: [{ name: speicherSchluessel(supabaseUrl), value: JSON.stringify(data.session) }] }] };
}
