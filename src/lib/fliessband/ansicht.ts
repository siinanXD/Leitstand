// Fließband-Startseite (SIN-815, Figma M1 98:2 und D1 99:45): aus /api/fliessband, Fertig-Liste und loop_events die Bahnen,
// Stationspunkte und die Zeitleiste der letzten 12 h bauen. Rein, ohne Netz; nichts wird erfunden.
import type { Fortschritt } from "../uebersicht-einfach";
import type { LoopEvent } from "../uebersicht";
import { FERTIG_STUNDEN, STATIONEN, type Farbe, type Fliessband, type Karte, type Station } from "./fliessband";

export const STATION_NAME: Record<Station, string> = {
  geplant: "Geplant",
  baut: "Baut",
  "pr-offen": "PR offen",
  pruefung: "Prüfung",
  einspruchsfrist: "Einspruchsfrist",
  gemergt: "Gemergt",
  "live-check": "Live-Check",
  fertig: "Fertig",
};

export const FARBE_WORT: Record<Farbe, string> = { gruen: "läuft", gelb: "wartet", rot: "hängt", blau: "repariert sich" };

/** Schlimmste Farbe zuerst: ein roter Punkt verdeckt nie einen Hänger. */
const RANG: Farbe[] = ["rot", "blau", "gelb", "gruen"];

export type Punkt = { station: Station; name: string; anzahl: number; farbe: Farbe | null };
export type Bahn = { id: string; punkte: Punkt[]; offen: Karte[]; spalten: Record<Station, Karte[]>; fertigListe: { fertig: number; gesamt: number } | null; leerText: string | null };

/** Je Produkt eine Bahn mit 8 Stationen. `offen` sind die Karten vor „Fertig“, schlimmste zuerst. */
export function bahnen(fb: Fliessband, fortschritt: Fortschritt[]): Bahn[] {
  return fb.produkte.map(({ id, karten }) => {
    const spalten = Object.fromEntries(STATIONEN.map((s) => [s, karten.filter((k) => k.station === s)])) as Record<Station, Karte[]>;
    const punkte = STATIONEN.map((s) => {
      const hier = spalten[s];
      return { station: s, name: STATION_NAME[s], anzahl: hier.length, farbe: RANG.find((f) => hier.some((k) => k.farbe === f)) ?? null };
    });
    const offen = karten.filter((k) => k.station !== "fertig").sort((a, b) => RANG.indexOf(a.farbe) - RANG.indexOf(b.farbe));
    const f = fortschritt.find((x) => x.project === id);
    const fertigListe = f ? { fertig: f.fertig, gesamt: f.gesamt } : null;
    const leerText = offen.length ? null : fertigListe && fertigListe.gesamt > 0 && fertigListe.fertig >= fertigListe.gesamt ? "Alles fertig und live. Nichts zu tun." : "Gerade nichts in Arbeit.";
    return { id, punkte, offen, spalten, fertigListe, leerText };
  });
}

/** Zweite Zeile einer Karte: Grund oder Farbwort, dazu „seit …“. */
export function kartenZeile(k: Karte, seitText: string | null): string {
  const was = k.grund ?? FARBE_WORT[k.farbe];
  return seitText ? `${was} · seit ${seitText.replace(/^vor /, "")}` : was;
}

export type Zeitpunkt = { key: string; zeit: string; farbe: Farbe; text: string };

const ROT = /^(failure|failed|error|fehler|rot|red|fail)$/i;

/** Letzte 12 h für die Desktop-Zeitleiste: Merges grün, rote Schritte rot. Titel aus den Karten, sonst Kennung. Neueste zuerst, höchstens `max`. */
export function zeitleiste(events: LoopEvent[], fb: Fliessband, namen: (id: string) => string, jetzt: Date, max = 6): Zeitpunkt[] {
  const ab = jetzt.getTime() - FERTIG_STUNDEN * 3_600_000;
  const titel = new Map(fb.produkte.flatMap((p) => p.karten.map((k) => [k.issue, k.titel] as const)));
  const gesehen = new Set<string>();
  return [...events]
    .filter((e) => {
      const t = Date.parse(e.created_at);
      return t >= ab && t <= jetzt.getTime();
    })
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .flatMap((e): Zeitpunkt[] => {
      const merge = e.step?.toUpperCase() === "MERGE" && !ROT.test(e.status ?? "");
      const rot = ROT.test(e.status ?? "");
      if (!merge && !rot) return [];
      const wer = e.issue ?? (e.pr ? `PR #${e.pr}` : null);
      const key = `${e.project}|${wer}|${merge ? "m" : "r"}`;
      if (!wer || gesehen.has(key)) return [];
      gesehen.add(key);
      const name = (e.issue && titel.get(e.issue)) || wer;
      const produkt = e.project ? `${namen(e.project)}: ` : "";
      return [{ key: e.id, zeit: e.created_at, farbe: merge ? "gruen" : "rot", text: `${produkt}${name} ${merge ? "gemergt" : `rot bei ${(e.step ?? "Schritt").toLowerCase()}`}` }];
    })
    .slice(0, max);
}
