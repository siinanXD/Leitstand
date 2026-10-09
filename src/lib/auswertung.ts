// Auswertung heute (SIN-424, E4). Rein; Eingabe sind loop_events und loop_snapshot, fehlende Daten bleiben leer statt erfunden.
import { BEREICHE, type Bereich, type BereichZeile } from "./bereiche";
import { brauchtDich, kontingente, type LoopEvent, type Quelle, type Quota } from "./uebersicht";

const tag = (iso: string | Date) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

export const heute = (events: LoopEvent[], jetzt: Date) => events.filter((e) => tag(e.created_at) === tag(jetzt));

export type Merge = { project: string; pr: number; selbstBehoben: boolean };

/** Heutige Merges (`merge`/`ok` mit PR-Nummer), je Projekt und PR einmal. Selbst behoben = der Loop hat auf diesem PR repariert. */
export function merges(events: LoopEvent[], jetzt: Date): Merge[] {
  const tagesereignisse = heute(events, jetzt);
  const repariert = new Set(tagesereignisse.filter((e) => e.step === "repair" && e.pr !== null).map((e) => `${e.project}#${e.pr}`));
  const gesehen = new Map<string, Merge>();
  for (const e of tagesereignisse) {
    if (e.step !== "merge" || e.status !== "ok" || e.pr === null || !e.project) continue;
    const schluessel = `${e.project}#${e.pr}`;
    gesehen.set(schluessel, { project: e.project, pr: e.pr, selbstBehoben: repariert.has(schluessel) });
  }
  return [...gesehen.values()];
}

export type Zahlen = { gemergt: number; selbstBehoben: number; brauchtDich: number; claude: Quota[] };

export function zahlen(q: Quelle, jetzt: Date): Zahlen {
  const m = merges(q.events, jetzt);
  return { gemergt: m.length, selbstBehoben: m.filter((x) => x.selbstBehoben).length, brauchtDich: brauchtDich(q.snapshot).length, claude: kontingente(q.snapshot).filter((k) => k.schaetzung) };
}

/** Ein Satz aus echten Zahlen mit Belegen (die Merges); ohne Daten heute und ohne Snapshot null. */
export function auswertungSatz(q: Quelle, jetzt: Date): { satz: string; belege: Merge[] } | null {
  const z = zahlen(q, jetzt);
  if (heute(q.events, jetzt).length === 0 && q.snapshot.length === 0) return null;
  const teile = [`${z.gemergt} ${z.gemergt === 1 ? "PR" : "PRs"} gemergt`];
  if (z.selbstBehoben > 0) teile.push(`${z.selbstBehoben} davon selbst behoben`);
  if (z.brauchtDich > 0) teile.push(`${z.brauchtDich} ${z.brauchtDich === 1 ? "wartet" : "warten"} auf dich`);
  return { satz: `Heute ${teile.join(", ")}.`, belege: merges(q.events, jetzt) };
}

/** Summiert Bereichszeilen mehrerer PRs eines Projekts (feste Reihenfolge); der erste Satz je Bereich bleibt. */
export function bereicheSumme(listen: BereichZeile[][]): BereichZeile[] {
  const summe = new Map<Bereich, BereichZeile>();
  for (const zeile of listen.flat()) {
    const alt = summe.get(zeile.bereich);
    summe.set(zeile.bereich, alt ? { ...alt, dateien: alt.dateien + zeile.dateien } : zeile);
  }
  return BEREICHE.flatMap((b) => summe.get(b) ?? []);
}
