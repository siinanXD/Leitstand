// Architekt (SIN-1034): reine Bewertung der Seiten. Kein Netz, kein Dateizugriff.
// `scripts/architekt/architekt.ts` liest Routenliste, Fertig-Liste und Seitenaufrufe und schreibt.

export const SCHRITT = "architekt";
export const TAGE = 30;

export type Urteil = "behalten" | "zusammenlegen" | "entfernen" | "neu" | "keine_daten";

export type Seite = {
  pfad: string;
  /** Aufrufe der letzten 30 Tage; undefined = keine Analytics, nie als 0 lesen. */
  aufrufe?: number;
  /** docs/FERTIG.md erwähnt die Seite. */
  inFertigListe: boolean;
  /** Seite, mit der sie sich sinnvoll zusammenlegen ließe (vom Agenten benannt). */
  zusammenMit?: string;
};

export type SeitenUrteil = { pfad: string; urteil: Urteil; grund: string; beleg: string; mit?: string };

export function bewerteSeite(s: Seite): SeitenUrteil {
  const beleg = s.aufrufe === undefined ? "Analytics fehlen" : `${s.aufrufe} Aufrufe in ${TAGE} Tagen`;
  const urteil = (u: Urteil, grund: string, mit?: string): SeitenUrteil => ({ pfad: s.pfad, urteil: u, grund, beleg, ...(mit ? { mit } : {}) });
  if (s.inFertigListe) return urteil("behalten", "Die Fertig-Liste verlangt die Seite.");
  if (s.aufrufe === undefined) return urteil("keine_daten", "Ohne Seitenaufrufe wird nichts entfernt.");
  if (s.aufrufe > 0) return s.zusammenMit ? urteil("zusammenlegen", `Wenig genutzt, passt zu ${s.zusammenMit}.`, s.zusammenMit) : urteil("behalten", "Die Seite wird aufgerufen.");
  return urteil("entfernen", `Kein Aufruf in ${TAGE} Tagen und nicht in der Fertig-Liste.`);
}

/** `entfernen` nur mit echter Zahl 0 und ohne Fertig-Listen-Treffer, egal was der Agent behauptet. */
export function pruefeUrteile(urteile: SeitenUrteil[], seiten: Seite[]): string[] {
  const fehler: string[] = [];
  for (const u of urteile) {
    const s = seiten.find((x) => x.pfad === u.pfad);
    if (!s) fehler.push(`${u.pfad}: Seite nicht in der Routenliste`);
    else if (u.urteil === "entfernen" && (s.inFertigListe || s.aufrufe !== 0)) fehler.push(`${u.pfad}: entfernen nicht belegt`);
    else if (u.urteil === "zusammenlegen" && !u.mit) fehler.push(`${u.pfad}: zusammenlegen ohne Ziel`);
  }
  return fehler;
}

/** Die Fertig-Liste nennt die Seite, wenn ihr erster Pfadteil (ohne Beispiel-Kennung) im Text steht. Die Startseite ist nie zuzuordnen. */
export function inFertigListe(pfad: string, fertigText: string): boolean {
  if (pfad === "/") return false;
  return fertigText.includes(pfad.split("/").slice(0, 2).join("/"));
}
