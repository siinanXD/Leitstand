// Veraltete Daten erkennen (SIN-659). Rein; Eingabe sind nur echte Zeilen aus loop_snapshot und loop_events.
import type { Quelle } from "./uebersicht";

export const SNAPSHOT_MAX_MIN = 30;
export const DISPATCH_MAX_MIN = 120;

export type Veraltet = { art: "snapshot" | "dispatcher"; /** ISO: letzter Stand, von dem wir wissen. */ seit: string };

const MIN = 60_000;
const zeit = (iso: string) => Date.parse(iso);

/** Jüngster Zeitstempel im Snapshot (ISO) oder null. Shortcut: über alle Projekte, nicht je Projekt; ausbauen, wenn ein einzelnes Produkt still stehen darf. */
export function datenStand(q: Quelle): string | null {
  const zeiten = q.snapshot.flatMap((s) => (s.updated_at && !Number.isNaN(zeit(s.updated_at)) ? [s.updated_at] : []));
  return zeiten.length ? zeiten.reduce((a, b) => (zeit(b) > zeit(a) ? b : a)) : null;
}

/** Snapshot älter als 30 Minuten oder Dispatcher seit über 2 Stunden ohne Lauf. Pausiert der Nutzer den Loop, steht er mit Absicht still: dann nie. Ohne Daten null (nichts erfinden). */
export function veraltet(q: Quelle, jetzt: Date, pausiert = false): Veraltet | null {
  if (pausiert) return null;
  const stand = datenStand(q);
  if (stand && jetzt.getTime() - zeit(stand) > SNAPSHOT_MAX_MIN * MIN) return { art: "snapshot", seit: stand };
  // parseEvents macht aus „dispatch“ die Stufe QUEUE.
  const laeufe = q.events.filter((e) => e.step === "QUEUE" &&!Number.isNaN(zeit(e.created_at))).map((e) => e.created_at);
  if (laeufe.length === 0) return null;
  const letzter = laeufe.reduce((a, b) => (zeit(b) > zeit(a) ? b : a));
  return jetzt.getTime() - zeit(letzter) > DISPATCH_MAX_MIN * MIN ? { art: "dispatcher", seit: letzter } : null;
}
