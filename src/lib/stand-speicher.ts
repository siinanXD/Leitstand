// Letzter Stand im Browser (SIN-579): nur Anzeige-Daten, damit die Seite beim Öffnen sofort Inhalt zeigt. Keine Schlüssel, keine Sitzung.
import type { Zeile } from "./ceo/ceo";
import type { Quelle } from "./uebersicht";

export type Gemerkt = { quelle: Quelle; chef: Zeile[] | null; zeit: string };

const SCHLUESSEL = "leitstand-stand-v1";

/** Jeder Zugriff kann scheitern (privater Modus, voller Speicher, kein Browser): dann gibt es eben keinen Stand. */
const speicher = (): Storage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

export function merke(g: Gemerkt, ziel: Storage | null = speicher()): void {
  try {
    ziel?.setItem(SCHLUESSEL, JSON.stringify(g));
  } catch {
    // shortcut: bei vollem Speicher bleibt der alte Stand stehen, bei Bedarf Ereignisse kürzen.
  }
}

/** Der gemerkte Stand; Unlesbares oder Fremdes gilt als keiner. */
export function erinnere(quelle: Storage | null = speicher()): Gemerkt | null {
  try {
    const roh = quelle?.getItem(SCHLUESSEL);
    const o = roh ? (JSON.parse(roh) as Partial<Gemerkt>) : null;
    const q = o?.quelle;
    if (!o || !q || !Array.isArray(q.events) || !Array.isArray(q.snapshot) || !(o.chef === null || Array.isArray(o.chef)) || typeof o.zeit !== "string" || Number.isNaN(Date.parse(o.zeit))) return null;
    return { quelle: q, chef: o.chef, zeit: o.zeit };
  } catch {
    return null;
  }
}

/** Beim Abmelden: der Stand gehört dem Nutzer, nicht dem Gerät. */
export function vergiss(ziel: Storage | null = speicher()): void {
  try {
    ziel?.removeItem(SCHLUESSEL);
  } catch {
    // nichts zu tun
  }
}
