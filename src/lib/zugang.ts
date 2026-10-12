/** Wohin es ohne bzw. mit Sitzung geht; null = bleiben. `/anmelden` und `/auth/callback` sind ohne Sitzung erreichbar. */
export function umleitung(hatSitzung: boolean, pfad: string): string | null {
  const offen = pfad === "/anmelden" || pfad.startsWith("/auth/");
  if (!hatSitzung && !offen) return "/anmelden";
  if (hatSitzung && pfad === "/anmelden") return "/";
  return null;
}

export const ANMELDEN_FEHLER = "Anmeldung nicht möglich. Prüfe die Adresse oder versuche es später erneut.";
export const ANMELDEN_GESENDET = "Link ist unterwegs. Öffne ihn auf diesem Gerät.";

type OtpClient = {
  auth: { signInWithOtp(a: { email: string; options: { shouldCreateUser: boolean; emailRedirectTo: string } }): PromiseLike<{ error: unknown }> };
};

/** Magic-Link ohne Registrierung (`shouldCreateUser: false`); jeder Fehler wird gleich gemeldet. */
export async function sendeLink(client: OtpClient, email: string, ursprung: string): Promise<string> {
  const adresse = email.trim();
  if (!adresse) return ANMELDEN_FEHLER;
  try {
    const { error } = await client.auth.signInWithOtp({ email: adresse, options: { shouldCreateUser: false, emailRedirectTo: `${ursprung}/auth/callback` } });
    return error ? ANMELDEN_FEHLER : ANMELDEN_GESENDET;
  } catch {
    return ANMELDEN_FEHLER;
  }
}

const LINK_TYPEN = ["magiclink", "email"] as const;
type LinkTyp = (typeof LINK_TYPEN)[number];

/** Token und Typ aus dem Mail-Link (`…/auth/v1/verify?token=…&type=magiclink`) lesen; null bei fremdem Host, fehlendem Token oder unbekanntem Typ. `projektUrl` ist die Supabase-URL des eigenen Projekts. */
export function leseLink(eingabe: string, projektUrl: string): { tokenHash: string; type: LinkTyp } | null {
  try {
    const link = new URL(eingabe.trim());
    const projekt = new URL(projektUrl);
    if (link.origin !== projekt.origin || link.pathname !== "/auth/v1/verify") return null;
    const tokenHash = link.searchParams.get("token");
    const type = link.searchParams.get("type");
    if (!tokenHash || tokenHash.startsWith("pkce_")) return null;
    if (!LINK_TYPEN.includes(type as LinkTyp)) return null;
    return { tokenHash, type: type as LinkTyp };
  } catch {
    return null;
  }
}

type LinkClient = {
  auth: { verifyOtp(a: { token_hash: string; type: LinkTyp }): PromiseLike<{ error: unknown }> };
};

/** Eingefügten Mail-Link prüfen und die Sitzung in dieser App anlegen. Null bei Erfolg, sonst dieselbe Meldung wie beim Code. */
export async function pruefeLink(client: LinkClient, eingabe: string, projektUrl: string): Promise<string | null> {
  const link = leseLink(eingabe, projektUrl);
  if (!link) return CODE_FEHLER;
  try {
    const { error } = await client.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
    return error ? CODE_FEHLER : null;
  } catch {
    return CODE_FEHLER;
  }
}

export const CODE_FEHLER ="Code falsch oder abgelaufen. Prüfe die Ziffern oder fordere einen neuen Code an.";

type VerifyClient = {
  auth: { verifyOtp(a: { email: string; token: string; type: "email" }): PromiseLike<{ error: unknown }> };
};

/** Code aus der Mail (6 Ziffern) prüfen, z. B. in der Home-Bildschirm-App am iPhone. Null bei Erfolg, sonst die Fehlermeldung; falsch und abgelaufen werden gleich gemeldet. */
export async function pruefeCode(client: VerifyClient, email: string, code: string): Promise<string | null> {
  const adresse = email.trim();
  const token = code.replace(/\s/g, "");
  if (!adresse || !/^\d{6}$/.test(token)) return CODE_FEHLER;
  try {
    const { error } = await client.auth.verifyOtp({ email: adresse, token, type: "email" });
    return error ? CODE_FEHLER : null;
  } catch {
    return CODE_FEHLER;
  }
}
