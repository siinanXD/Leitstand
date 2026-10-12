import { createClient } from "@supabase/supabase-js";
import { SPERRFENSTER_MS, type Speicher } from "./kopplung";

/** Speicher auf den Tabellen `public.leitstand_kopplung` und `public.leitstand_kopplung_versuche` (public, weil PostgREST nur freigegebene Schemas kennt), nur mit dem Service-Role-Key. */
export function supabaseSpeicher(url: string, serviceKey: string): Speicher {
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  return {
    async anlegen({ codeHash, tokenHash, ablauf }) {
      const { error } = await db.from("leitstand_kopplung").insert({ code_hash: codeHash, token_hash: tokenHash, ablauf: ablauf.toISOString() });
      if (!error) return true;
      if (error.code === "23505") return false;
      throw new Error("kopplung anlegen fehlgeschlagen");
    },
    async einloesen(codeHash, jetzt) {
      // Löschen mit Rückgabe ist atomar: nur ein Aufruf bekommt die Zeile.
      const { data, error } = await db.from("leitstand_kopplung").delete().eq("code_hash", codeHash).gt("ablauf", jetzt.toISOString()).select("token_hash");
      if (error) throw new Error("kopplung einlösen fehlgeschlagen");
      return data?.[0]?.token_hash ?? null;
    },
    async versuch(jetzt) {
      const { data, error } = await db.from("leitstand_kopplung_versuche").insert({ created_at: jetzt.toISOString() }).select("id").single();
      if (error || !data) throw new Error("versuch zählen fehlgeschlagen");
      const seit = new Date(jetzt.getTime() - SPERRFENSTER_MS).toISOString();
      const { count, error: zaehlFehler } = await db.from("leitstand_kopplung_versuche").select("id", { count: "exact", head: true }).gte("created_at", seit);
      if (zaehlFehler || count === null) throw new Error("versuche zählen fehlgeschlagen");
      return {
        anzahl: count,
        async zurueck() {
          await db.from("leitstand_kopplung_versuche").delete().eq("id", data.id);
        },
      };
    },
    async aufraeumen(jetzt) {
      await db.from("leitstand_kopplung").delete().lte("ablauf", jetzt.toISOString());
      await db.from("leitstand_kopplung_versuche").delete().lt("created_at", new Date(jetzt.getTime() - SPERRFENSTER_MS).toISOString());
    },
  };
}

/** `hashed_token` für einen Magic-Link der Adresse; null bei Fehler. */
export async function hashedToken(url: string, serviceKey: string, email: string): Promise<string | null> {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  return error ? null : (data.properties?.hashed_token ?? null);
}
