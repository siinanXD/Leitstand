// Pause des Loops (SIN-530). Rein. Der Schalter ist das jüngste `loop_events`-Ereignis mit Schritt PAUSE:
// `pausiert` hält `dispatch` an, `weiter` hebt die Pause auf. Das Wort steht in `grund` (Status `ok`), weil
// `loop_events_status_check` nur start/ok/fehler/uebersprungen/needs_human erlaubt (SIN-921). Alte Zeilen mit dem Wort im Status bleiben lesbar.

import { zeitInWorten } from "./zeit";

export const PAUSE_SCHRITT = "PAUSE";
export const PAUSIERT = "pausiert";
export const WEITER = "weiter";

export type PauseZeile = { step: string | null; status: string | null; grund?: string | null; created_at: string };
export type PauseStand = { pausiert: false } | { pausiert: true; seit: string };

/** Stand aus beliebig sortierten Zeilen: zählt nur das jüngste PAUSE-Ereignis. Fehlendes Ereignis = läuft. */
export function pauseStand(zeilen: PauseZeile[]): PauseStand {
  let jung: { wort: string; created_at: string } | null = null;
  for (const z of zeilen) {
    const wort = [PAUSIERT, WEITER].find((w) => z.grund === w || z.status === w);
    if (z.step?.toUpperCase() !== PAUSE_SCHRITT || !wort) continue;
    if (!jung || Date.parse(z.created_at) > Date.parse(jung.created_at)) jung = { wort, created_at: z.created_at };
  }
  return jung?.wort === PAUSIERT ? { pausiert: true, seit: jung.created_at } : { pausiert: false };
}

/** Zeile für `loop_events`; Schlüssel wie in `scripts/loop/loop.ts`. */
export const pauseZeile = (pausiert: boolean) => ({ project: "leitstand", step: PAUSE_SCHRITT, status: "ok", grund: pausiert ? PAUSIERT : WEITER, issue: null, pr: null });

export function pauseEingabe(body: unknown): boolean | null {
  const v = body && typeof body === "object" ? (body as Record<string, unknown>).pausiert : undefined;
  return typeof v === "boolean" ? v : null;
}

/** Text für den Satz oben, die Zeit in Worten (SIN-578). */
export const pauseSatz = (seit: string, jetzt = new Date()) => `Pausiert, angehalten ${zeitInWorten(seit, jetzt) ?? "vor einer Weile"}.`;
