// Drei Kennzahlen, die zählen (SIN-630). Rein, ohne Netz. Quellen und Regeln: docs/decisions/SIN-630-drei-kennzahlen.md.
// Wochenwerte stehen als Zähler/Nenner in `kennzahlen_woche`; ohne Nenner gibt es keinen Wert (nie geschätzt, nie 0).

export type Kennzahl = "verkaufsfertig" | "kosten_je_einheit" | "fehlgeschlagene_aenderungen";
export type WochenZeile = { kennzahl: string; woche: string; zaehler: number; nenner: number };

export const WOCHEN = 8;
export const WOCHE_MS = 7 * 24 * 3_600_000;
export const FRIST_AENDERUNG_MS = 48 * 3_600_000;
/** Ziel MAF Metall (SIN-630): 890 Einheiten, 90 % verkaufsfertig. */
export const ZIEL_EINHEITEN = 890;
export const ZIEL_VERKAUFSFERTIG = 0.9;

export const NAMEN: Record<Kennzahl, string> = {
  verkaufsfertig: "Verkaufsfertig",
  kosten_je_einheit: "Kosten je bestandener Einheit",
  fehlgeschlagene_aenderungen: "Fehlgeschlagene Änderungen",
};

export type Einheit = { veroeffentlicht: boolean; ersterDurchlaufBestanden: boolean; quelleKursPassend: boolean; inRoterProbe: boolean };
export type Aenderung = { gemergtAm: string; zurueckgenommenAm?: string | null; repariertAm?: string | null; roteProbeAm?: string | null };

/** Zähler und Nenner „Verkaufsfertig“: Anteil veröffentlichter Einheiten, die alle drei Bedingungen erfüllen. */
export function verkaufsfertig(einheiten: readonly Einheit[]): { zaehler: number; nenner: number } {
  const veroeffentlicht = einheiten.filter((e) => e.veroeffentlicht);
  return { zaehler: veroeffentlicht.filter((e) => e.ersterDurchlaufBestanden && e.quelleKursPassend && !e.inRoterProbe).length, nenner: veroeffentlicht.length };
}

/** Eine gemergte Änderung scheitert, wenn sie binnen 48 h zurückgenommen, repariert oder durch eine rote Probe auffiel. */
export function fehlgeschlagen(aenderungen: readonly Aenderung[]): { zaehler: number; nenner: number } {
  const binnen48h = (a: Aenderung, wann: string | null | undefined) => {
    const dauer = wann ? Date.parse(wann) - Date.parse(a.gemergtAm) : NaN;
    return dauer >= 0 && dauer <= FRIST_AENDERUNG_MS;
  };
  const schlecht = aenderungen.filter((a) => [a.zurueckgenommenAm, a.repariertAm, a.roteProbeAm].some((w) => binnen48h(a, w)));
  return { zaehler: schlecht.length, nenner: aenderungen.length };
}

export type Punkt = { woche: string; wert: number | null };
export type Reihe = { kennzahl: Kennzahl; name: string; aktuell: number | null; punkte: Punkt[] };

/** Montag der Woche (UTC) als YYYY-MM-DD. */
export function wochenStart(t: number): string {
  const d = new Date(t);
  const tage = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - tage)).toISOString().slice(0, 10);
}

/** 8 Wochen bis einschließlich der laufenden; Wochen ohne Zeile oder ohne Nenner haben `wert: null`. */
export function reihe(kennzahl: Kennzahl, zeilen: readonly WochenZeile[], jetzt: Date): Reihe {
  const heute = Date.parse(wochenStart(jetzt.getTime()));
  const punkte = Array.from({ length: WOCHEN }, (_, i) => {
    const woche = new Date(heute - (WOCHEN - 1 - i) * WOCHE_MS).toISOString().slice(0, 10);
    const z = zeilen.find((r) => r.kennzahl === kennzahl && r.woche === woche);
    return { woche, wert: z && z.nenner > 0 ? z.zaehler / z.nenner : null };
  });
  return { kennzahl, name: NAMEN[kennzahl], aktuell: [...punkte].reverse().find((p) => p.wert !== null)?.wert ?? null, punkte };
}

export const alle = (zeilen: readonly WochenZeile[], jetzt: Date): Reihe[] => (Object.keys(NAMEN) as Kennzahl[]).map((k) => reihe(k, zeilen, jetzt));

/** Zahl als Wort: dieselbe Schreibweise für Kachel, „00 Wo stehen wir.md“ und die Content-Landkarte-Routine. */
export const zahlText = (r: Reihe): string =>
  r.aktuell === null ? "noch keine Zahl" : r.kennzahl === "kosten_je_einheit" ? `${r.aktuell.toFixed(2).replace(".", ",")} €` : `${Math.round(r.aktuell * 100)} %`;

export const zeileText = (r: Reihe): string => `${r.name}: ${zahlText(r)}`;
