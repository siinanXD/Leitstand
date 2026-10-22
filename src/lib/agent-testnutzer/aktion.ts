/** Das Agent-Testkonto (SIN-913) darf alles sehen und nichts auslösen: jede Methode außer Lesen wird abgelehnt. */
const LESEN = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Agent-Konto: der Marker `app_metadata.agent_testnutzer` aus der Sitzung (derselbe, an dem die RLS-Sperren hängen) oder
 * die E-Mail aus `AGENT_TESTNUTZER_EMAIL`. Fehlt die Variable, bleibt die Sperre über den Marker erhalten (kein fail-open).
 */
export function istAgent(email: string, agentEmail: string | undefined, marker = false): boolean {
  if (marker) return true;
  const soll = agentEmail?.trim().toLowerCase();
  return !!soll && email.trim().toLowerCase() === soll;
}

/** 200 = erlaubt, 403 = Agent-Konto will eine Aktion auslösen. */
export function aktionsStatus(email: string, methode: string, agentEmail: string | undefined, marker = false): 200 | 403 {
  return istAgent(email, agentEmail, marker) && !LESEN.has(methode.toUpperCase()) ? 403 : 200;
}
