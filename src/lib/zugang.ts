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
