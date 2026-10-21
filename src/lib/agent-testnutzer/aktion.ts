/** Das Agent-Testkonto (SIN-913) darf alles sehen und nichts auslösen: jede Methode außer Lesen wird abgelehnt. */
const LESEN = new Set(["GET", "HEAD", "OPTIONS"]);

export function istAgent(email: string, agentEmail: string | undefined): boolean {
  const soll = agentEmail?.trim().toLowerCase();
  return !!soll && email.trim().toLowerCase() === soll;
}

/** 200 = erlaubt, 403 = Agent-Konto will eine Aktion auslösen. */
export function aktionsStatus(email: string, methode: string, agentEmail: string | undefined): 200 | 403 {
  return istAgent(email, agentEmail) && !LESEN.has(methode.toUpperCase()) ? 403 : 200;
}
