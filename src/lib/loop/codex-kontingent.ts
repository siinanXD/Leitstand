/** Codex-Kontingent aus dem Zeitstempel des Labels `codex-leer` (SIN-832). Rein, ohne Netz. */
export const FENSTER_MS = 5 * 60 * 60_000;

export type CodexKontingent = { frei: true } | { frei: false; seit: string; bis: string };

/** `leerSeit` = ISO-Zeitstempel, an dem der Dispatcher `codex-leer` gesetzt hat; null/ungültig = frei. */
export function codexKontingent(leerSeit: string | null, jetzt: Date): CodexKontingent {
  const t = leerSeit ? Date.parse(leerSeit) : NaN;
  if (Number.isNaN(t) || t + FENSTER_MS <= jetzt.getTime()) return { frei: true };
  return { frei: false, seit: new Date(t).toISOString(), bis: new Date(t + FENSTER_MS).toISOString() };
}

/** Text für die Team-Ansicht, Uhrzeit in UTC. */
export function kontingentText(k: CodexKontingent): string {
  return k.frei ? "Kontingent: frei" : `Kontingent: leer seit ${k.seit.slice(11, 16)}`;
}
