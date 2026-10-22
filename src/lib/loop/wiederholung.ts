/** Letztes gespeichertes Ereignis zum selben Projekt, Schritt und Issue (nur die Felder, die verglichen werden). */
export type LetztesEreignis = { status: string | null; grund: string | null; created_at: string };

/** So lange schreibt der Dispatcher denselben Stand nicht noch einmal; danach einmal als Lebenszeichen. */
export const WIEDERHOLUNG_STUNDEN = 6;

/** Diese Ereignisse wiederholen sich bei jedem Dispatch (alle 15 Min) unverändert: über 1.000 Zeilen je Woche ohne Neuigkeit. */
export const istLaufzustand = (step: string, status: string) => status === "uebersprungen" || step === "platz";

/**
 * Leerlauf (Bewertung 22.10.): Gleicher Status und Grund wie das letzte Ereignis innerhalb von WIEDERHOLUNG_STUNDEN →
 * nicht noch einmal speichern. Fehler und Starts zählen immer.
 */
export function istWiederholung(letztes: LetztesEreignis | null, neu: { step: string; status: string; grund: string | null }, jetzt: Date): boolean {
  if (!letztes || !istLaufzustand(neu.step, neu.status)) return false;
  if (letztes.status !== neu.status || (letztes.grund ?? null) !== (neu.grund ?? null)) return false;
  return jetzt.getTime() - Date.parse(letztes.created_at) < WIEDERHOLUNG_STUNDEN * 3_600_000;
}
