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

export const CODE_FEHLER = "Code falsch oder abgelaufen. Prüfe die Ziffern oder fordere einen neuen Code an.";

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
