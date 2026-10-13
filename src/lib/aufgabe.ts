// Ablauf einer Aufgabe nach Figma A5 (SIN-556). Rein; Eingabe sind Zeilen aus loop_events mit dem JSON einer Rolle (`payload`) und der Snapshot.
// Nichts wird erfunden: Rollen ohne Meldung stehen als „keine Meldung“ da.
import { projektInfo } from "./projekte";
import { linearLink } from "./projektseite";
import type { SnapshotRow } from "./uebersicht";

/** Feste Reihenfolge der Rollen (SIN-543); unbekannte Rollen aus den Daten kommen davor, in Reihenfolge ihrer Meldung. */
export const ROLLEN = [
  { id: "ceo", name: "CEO" },
  { id: "vorarbeiter", name: "Vorarbeiter" },
  { id: "forscher", name: "Forscher" },
  { id: "bauer", name: "Bauer" },
  { id: "pruefer", name: "Prüfer" },
  { id: "anwalt", name: "Anwalt" },
] as const;

export type Meldung = {
  rolle: string;
  zeitpunkt: string;
  status: string | null;
  zusammenfassung: string | null;
  naechsterSchritt: string | null;
  kostenEur: number | null;
  quellen: string[];
  werkzeuge: string[];
  /** Das ganze JSON, für „Zuletzt gemeldet“. */
  roh: Record<string, unknown>;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const texte = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap((x) => (str(x) ? [str(x)!] : [])) : []);
const http = (v: unknown): string | null => {
  const s = str(v);
  return s && /^https?:\/\//i.test(s) ? s : null;
};

/** Zeilen aus loop_events → Meldungen dieser Aufgabe, älteste zuerst. Zeilen ohne lesbares `payload` mit `rolle` fallen weg. */
export function parseMeldungen(raw: unknown, issue: string): Meldung[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((r): Meldung[] => {
      const zeile = obj(r);
      let p: unknown = zeile?.payload;
      if (typeof p === "string") {
        try {
          p = JSON.parse(p);
        } catch {
          return [];
        }
      }
      const roh = obj(p);
      const rolle = str(roh?.rolle)?.toLowerCase();
      const zeitpunkt = str(roh?.zeitpunkt) ?? str(zeile?.created_at);
      if (!roh || !rolle || !zeitpunkt || Number.isNaN(Date.parse(zeitpunkt))) return [];
      if ((str(roh.issue) ?? str(zeile?.issue)) !== issue) return [];
      const kosten = roh.kosten_eur;
      return [
        {
          rolle,
          zeitpunkt,
          status: str(roh.status),
          zusammenfassung: str(roh.zusammenfassung),
          naechsterSchritt: str(roh.naechster_schritt),
          kostenEur: typeof kosten === "number" && Number.isFinite(kosten) ? kosten : null,
          quellen: texte(roh.quellen),
          werkzeuge: texte(roh.werkzeuge),
          roh,
        },
      ];
    })
    .sort((a, b) => Date.parse(a.zeitpunkt) - Date.parse(b.zeitpunkt));
}

export type Zustand = "laeuft" | "wartet" | "fertig" | "kaputt";
export const ZUSTAND_NAME: Record<Zustand, string> = { laeuft: "läuft", wartet: "wartet", fertig: "fertig", kaputt: "kaputt" };

/** Status-Text der Rolle → Zustand. Unbekannter Text zählt als „wartet“ (nie als fertig ausgeben). */
export function zustandVon(status: string | null): Zustand {
  if (!status) return "wartet";
  if (/fail|error|kaputt|abort|crash|rot|timeout|fehler/i.test(status)) return "kaputt";
  if (/^(ok|done|fertig|merged|success|gruen|grün|abgeschlossen)$/i.test(status)) return "fertig";
  if (/start|running|laeuft|läuft|in_progress|active/i.test(status)) return "laeuft";
  return "wartet";
}

export type Schritt = { rolle: string; name: string; meldung: Meldung | null; zustand: Zustand; satz: string; werkzeuge: string[] };

const nameVon = (id: string) => ROLLEN.find((r) => r.id === id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1);

/** Je Rolle die jüngste Meldung. Gelaufene Rollen in Reihenfolge ihrer ersten Meldung, danach die übrigen der festen Reihe grau. */
export function ablauf(meldungen: Meldung[]): Schritt[] {
  const gelaufen: string[] = [];
  for (const m of meldungen) if (!gelaufen.includes(m.rolle)) gelaufen.push(m.rolle);
  const ids = [...gelaufen, ...ROLLEN.map((r) => r.id).filter((id) => !gelaufen.includes(id))];
  return ids.map((rolle): Schritt => {
    const meldung = [...meldungen].reverse().find((m) => m.rolle === rolle) ?? null;
    if (!meldung) return { rolle, name: nameVon(rolle), meldung, zustand: "wartet", satz: "keine Meldung", werkzeuge: [] };
    return { rolle, name: nameVon(rolle), meldung, zustand: zustandVon(meldung.status), satz: meldung.zusammenfassung ?? "keine Meldung", werkzeuge: meldung.werkzeuge };
  });
}

export type Kopf = { kennung: string; titel: string | null; projekt: string | null; marke: Zustand | null; dauerMin: number | null; spur: string | null; kostenEur: number | null };

/** Kopf der Seite. Marke: ein kaputter Schritt gewinnt, sonst zählt die jüngste Meldung. Läuft sie noch, zählt die Dauer bis jetzt. */
export function kopf(meldungen: Meldung[], snapshot: SnapshotRow[], issue: string, jetzt: Date): Kopf {
  const zeile = snapshot.find((s) => s.issue === issue);
  const letzte = meldungen.at(-1) ?? null;
  const kaputt = ablauf(meldungen).some((s) => s.meldung && s.zustand === "kaputt");
  const marke = !letzte ? null : kaputt ? "kaputt" : zustandVon(letzte.status);
  const von = meldungen[0] ? Date.parse(meldungen[0].zeitpunkt) : null;
  const bis = letzte ? (marke === "laeuft" ? jetzt.getTime() : Date.parse(letzte.zeitpunkt)) : null;
  const kosten = meldungen.filter((m) => m.kostenEur !== null);
  return {
    kennung: issue,
    titel: zeile?.title && zeile.title !== issue ? zeile.title : null,
    projekt: zeile?.project ?? null,
    marke,
    dauerMin: von !== null && bis !== null ? Math.max(0, Math.round((bis - von) / 60_000)) : null,
    spur: [...meldungen].reverse().map((m) => str(m.roh.spur)).find((s) => s !== null) ?? null,
    kostenEur: kosten.length ? kosten.reduce((s, m) => s + (m.kostenEur ?? 0), 0) : null,
  };
}

export type AufgabeLink = { name: string; href: string | null };

/** PR, Linear, Langfuse-Trace, Laufprotokoll. Nur Bekanntes hat eine Adresse (Trace und Protokoll aus dem JSON, sonst das Repo). */
export function aufgabeLinks(meldungen: Meldung[], snapshot: SnapshotRow[], issue: string): AufgabeLink[] {
  const zeile = snapshot.find((s) => s.issue === issue);
  const projekt = zeile ? projektInfo(zeile.project) : null;
  const jung = (feld: string) => [...meldungen].reverse().map((m) => http(m.roh[feld])).find((h) => h !== null) ?? null;
  const pr = zeile?.pr ?? null;
  return [
    { name: "PR", href: jung("pr_url") ?? (pr && projekt?.repo ? `https://github.com/${projekt.repo}/pull/${pr}` : null) },
    { name: "Linear", href: linearLink(issue) },
    { name: "Langfuse-Trace", href: jung("langfuse_trace") ?? jung("trace_url") },
    { name: "Laufprotokoll", href: jung("laufprotokoll") ?? (projekt?.repo ? `https://github.com/${projekt.repo}/blob/main/docs/autonomy/laeufe/${issue}.json` : null) },
  ];
}
