/**
 * Belege-Prüfer (SIN-846): Haken, die nur ein Beleg sind (Zählung, Run-Link, Trockenlauf), hakt ein Lese-Agent ab, nie der Bau-Worker.
 * Rein, ohne Netz. Proben stehen im Haken-Text als `[probe:zaehlung:<tabelle>:<min>]` oder `[probe:run:<workflow.yml>]`,
 * das Skript führt nur diese festen Proben aus, nie freies SQL.
 */

import { leseHaken } from "../loop/haken";

const BELEG_WORT = /zählung|zaehlung|run-link|trockenlauf|beleg/i;
const PROBE = /\[probe:(zaehlung|run):([a-z_][a-z0-9_]*|[\w.-]+\.ya?ml)(?::(\d+))?\]/i;

export const istBelegHaken = (text: string) => BELEG_WORT.test(text);

/** Alle offenen Haken sind Belege-Haken (mindestens einer): Übergabe an den Prüfer statt Bau-Worker. */
export function nurBelege(beschreibung: string | null | undefined): boolean {
  const offen = leseHaken(beschreibung).filter((h) => !h.erledigt);
  return offen.length > 0 && offen.every((h) => istBelegHaken(h.text));
}

export type Probe = { art: "zaehlung"; tabelle: string; min: number } | { art: "run"; workflow: string };

/** Feste Probe aus dem Haken-Text; ohne gültige Probe `null` (der Haken bleibt offen, der Kommentar nennt den Grund). */
export function leseProbe(text: string): Probe | null {
  const m = PROBE.exec(text);
  if (!m) return null;
  if (m[1].toLowerCase() === "zaehlung") return /^[a-z_][a-z0-9_]*$/.test(m[2]) ? { art: "zaehlung", tabelle: m[2], min: Number(m[3] ?? 1) } : null;
  return /\.ya?ml$/i.test(m[2]) ? { art: "run", workflow: m[2] } : null;
}

/** Bewertung einer Probe: Zählung erreicht das Minimum, jüngster Run ist grün. */
export function bewerte(p: Probe, messwert: number | string): { belegt: boolean; beleg: string } {
  if (p.art === "zaehlung") {
    const n = Number(messwert);
    return { belegt: Number.isFinite(n) && n >= p.min, beleg: `Zählung ${p.tabelle}: ${messwert} (Minimum ${p.min})` };
  }
  return { belegt: messwert === "success", beleg: `Run ${p.workflow}: ${messwert}` };
}
