/**
 * Erwarteter Takt je Rolle (SIN-736): einzige Quelle für jeden Stillstands-Check (Wächter, Stand, Push „Alarm“).
 * Kein fest verdrahtetes „6 h“; Daten in docs/autonomy/rollen.json. Rein, kein Netz.
 */
import rollenJson from "../../../docs/autonomy/rollen.json";

export type Takt = "15min" | "stuendlich" | "2h" | "taeglich" | "woechentlich" | "monatlich" | "ereignis" | "aus";
export type Rolle = { schritt: string; takt: Takt; grenze_h: number; alias: string[] };
export type Urteil = "ok" | "hinweis" | "alarm";
export type Befund = { rolle: string; urteil: Urteil; alterH: number | null };
/** Ereignis aus `loop_events`: Rolle steht in `step` oder `agent`. */
export type RollenLauf = { step: string | null; agent?: string | null; created_at: string };

export const ROLLEN: readonly Rolle[] = rollenJson.rollen as Rolle[];

const STUNDE = 3_600_000;
const klein = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Jüngster Lauf der Rolle (auch unter alten Namen), ms; null = nie gesehen. */
export function letzterLauf(rolle: Rolle, events: readonly RollenLauf[]): number | null {
  const namen = new Set([rolle.schritt, ...rolle.alias].map(klein));
  let neu: number | null = null;
  for (const e of events) {
    if (!namen.has(klein(e.step)) && !namen.has(klein(e.agent))) continue;
    const t = Date.parse(e.created_at);
    if (!Number.isNaN(t) && (neu === null || t > neu)) neu = t;
  }
  return neu;
}

/**
 * Stillstand je Rolle: Über `grenze_h` ist ein periodischer Takt ein Alarm, ein Ereignis-Takt nur ein Hinweis
 * (kein Urgent-Issue), `aus` wird nicht geprüft. Nie gesehen gilt als ok: ohne Verlauf gibt es nichts zu vergleichen.
 */
export function pruefeRollen(events: readonly RollenLauf[], jetzt: number, rollen: readonly Rolle[] = ROLLEN): Befund[] {
  return rollen.flatMap((r): Befund[] => {
    if (r.takt === "aus") return [];
    const zuletzt = letzterLauf(r, events);
    if (zuletzt === null) return [{ rolle: r.schritt, urteil: "ok", alterH: null }];
    const alterH = (jetzt - zuletzt) / STUNDE;
    const urteil: Urteil = alterH <= r.grenze_h ? "ok" : r.takt === "ereignis" ? "hinweis" : "alarm";
    return [{ rolle: r.schritt, urteil, alterH }];
  });
}

/** Rolle in `rollen.json` pausiert (`takt: aus`, SIN-941): kein Start, keine Probe. Unbekannte Rollen gelten als aktiv. */
export const rolleAus = (schritt: string, rollen: readonly Rolle[] = ROLLEN): boolean => rollen.find((r) => r.schritt === schritt)?.takt === "aus";
