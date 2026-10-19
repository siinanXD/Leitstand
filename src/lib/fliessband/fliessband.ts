// Fließband (SIN-814): jede offene oder seit 12 h fertige Aufgabe mit Station, Farbe, Grund, Dauer und Links. Rein, ohne Netz.
// Eingabe sind leitstand_aufgaben (Linear), loop_snapshot (offene PRs) und loop_events; nichts wird erfunden.
import type { Aufgabe } from "../aufgaben";
import { projektKuerzel, stufeKuerzel, type SnapshotRow } from "../uebersicht";

export const PRODUKTE = ["lernapp", "sjcode-website", "stromlauf-ai", "leitstand"] as const;
// Historische API-Daten behalten den Stationswert; in der Aufbauphase wird keine Karte dorthin geroutet.
export const STATIONEN = ["geplant", "baut", "pr-offen", "pruefung", "einspruchsfrist", "gemergt", "live-check", "fertig"] as const;
export type Station = (typeof STATIONEN)[number];
export type Farbe = "gruen" | "gelb" | "rot" | "blau";

export const HAENGT_MIN = 90;
export const FERTIG_STUNDEN = 12;
const ROT = new Set(["failure", "failed", "error", "red", "fail", "rot"]);
const GRUEN = new Set(["success", "ok", "green", "passed", "pass", "gruen", "grün"]);

export type FliessEreignis = { created_at: string; project: string | null; step: string | null; status: string | null; issue: string | null; pr: number | null; grund: string | null; run: string | null };
export type FliessAufgabe = Aufgabe & { /** Eltern- und verwandte Issues (Spalte `bezug`). */ bezug: string[] };
export type Karte = {
  issue: string;
  titel: string;
  produkt: string;
  station: Station;
  farbe: Farbe;
  grund: string | null;
  seit: string | null;
  haken: { erledigt: number; gesamt: number } | null;
  links: { linear: string; pr: string | null; run: string | null };
};
export type BrauchtDich = { text: string; url: string };
export type Fliessband = { erzeugt: string; produkte: { id: string; karten: Karte[] }[]; brauchtDich: BrauchtDich[]; brauchtDichText: string | null };

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Zeilen aus loop_events; `grund` und Run-Link auch aus `payload`. Unlesbares fällt weg. */
export function parseFliessEreignisse(raw: unknown): FliessEreignis[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const o = obj(r);
    const t = text(o.created_at);
    if (!t || Number.isNaN(Date.parse(t))) return [];
    const p = obj(o.payload);
    return [{ created_at: t, project: projektKuerzel(text(o.project)), step: stufeKuerzel(text(o.step))?.toUpperCase() ?? null, status: text(o.status)?.toLowerCase() ?? null, issue: text(o.issue),
      pr: typeof o.pr === "number" ? o.pr : null, grund: text(o.grund) ?? text(p.grund), run: text(o.run_url) ?? text(p.run_url) }];
  });
}

/** Spalte `bezug` aus leitstand_aufgaben, nach Aufgabe-Kennung. */
export const bezugVon = (zeilen: unknown): Map<string, string[]> =>
  new Map((Array.isArray(zeilen) ? zeilen : []).flatMap((z) => {
    const o = obj(z);
    const issue = text(o.issue);
    return issue ? [[issue, Array.isArray(o.bezug) ? o.bezug.filter((x): x is string => typeof x === "string") : []] as [string, string[]]] : [];
  }));

const linearUrl = (issue: string) => `https://linear.app/sinan-kahraman/issue/${issue}`;
const minuten = (von: string | null, jetzt: Date) => (von ? (jetzt.getTime() - Date.parse(von)) / 60_000 : 0);
const spaeter = (a: string | null, b: string | null) => (a && b ? (Date.parse(a) >= Date.parse(b) ? a : b) : (a ?? b));
const issueAusTitel = (titel: string) => /\bSIN-\d+/.exec(titel)?.[0] ?? null;
const neuZuerst = (a: FliessEreignis, b: FliessEreignis) => Date.parse(b.created_at) - Date.parse(a.created_at);

export function fliessband({ aufgaben, snapshot, events, jetzt }: { aufgaben: FliessAufgabe[]; snapshot: SnapshotRow[]; events: FliessEreignis[]; jetzt: Date }): Fliessband {
  const prs = snapshot.flatMap((s) => s.open_prs.map((pr) => ({ ...pr, produkt: s.project })));
  const laeuftGerade = aufgaben.filter((a) => a.status === "laeuft");

  const karten = aufgaben.flatMap((a): Karte[] => {
    const produkt = a.projekt;
    if (!produkt || !(PRODUKTE as readonly string[]).includes(produkt) || a.status === "abgebrochen") return [];
    if (a.status === "fertig" && (!a.fertig || minuten(a.fertig, jetzt) > FERTIG_STUNDEN * 60)) return [];

    const pr = prs.find((p) => issueAusTitel(p.titel) === a.issue || events.some((e) => e.pr === p.nummer && e.issue === a.issue));
    const ev = events.filter((e) => e.issue === a.issue || (pr && e.pr === pr.nummer)).sort(neuZuerst);
    const gemergt = ev.find((e) => e.step === "MERGE" && !ROT.has(e.status ?? ""));
    // Live-Check: Probe nach dem Mergen, zum Issue oder (ohne Issue) zum Produkt.
    const live = gemergt && events.filter((e) => e.step === "ABNAHME" && (e.issue === a.issue || (e.issue === null && e.project === produkt)) && Date.parse(e.created_at) >= Date.parse(gemergt.created_at)).sort(neuZuerst)[0];
    const letzter = ev.reduce<string | null>((m, e) => spaeter(m, e.created_at), a.gestartet);
    const blockiert = snapshot.find((s) => s.issue === a.issue)?.blocked_by ?? [];

    let station: Station;
    let farbe = "gruen" as Farbe;
    let grund: string | null = null;
    let seit: string | null = a.gestartet;
    const wartet = (g: string) => { farbe = "gelb"; grund = g; };
    const rot = (g: string) => { farbe = "rot"; grund = g; };

    if (a.status === "fertig" || (live && GRUEN.has(live.status ?? ""))) {
      station = "fertig";
      seit = a.fertig ?? live?.created_at ?? null;
    } else if (gemergt) {
      seit = gemergt.created_at;
      if (live) {
        station = "live-check";
        seit = live.created_at;
        if (!GRUEN.has(live.status ?? "")) rot(live.grund ?? "Die Probe nach dem Mergen ist rot.");
      } else {
        station = "gemergt";
        if (minuten(seit, jetzt) > 15) wartet("Der Live-Check steht noch aus.");
      }
    } else if (pr) {
      seit = ev.at(-1)?.created_at ?? a.gestartet;
      const checkRot = !pr.ciGruen && ev.some((e) => e.step !== "GATE" && ROT.has(e.status ?? ""));
      if (pr.entwurf || (!pr.ciGruen && !checkRot)) {
        station = "pr-offen";
        if (pr.entwurf) wartet("Der PR ist noch ein Entwurf.");
      } else {
        station = "pruefung";
        if (a.haken && a.haken.erledigt < a.haken.gesamt) wartet(`Bewertungen fehlen: ${a.haken.erledigt} von ${a.haken.gesamt} Kriterien belegt.`);
      }
      if (checkRot) rot(ev.find((e) => ROT.has(e.status ?? "") && e.grund)?.grund ?? "Eine Prüfung ist rot.");
      else if (pr.labels.includes("risk:high") && !pr.labels.includes("freigegeben")) wartet("Wartet auf deine Freigabe.");
    } else if (a.status === "laeuft") {
      station = "baut";
    } else {
      station = "geplant";
      seit = null;
      if (blockiert.length) wartet(`Blockiert durch ${blockiert.join(", ")}.`);
    }

    // Rot auch: needs-human oder länger als 90 Minuten ohne Fortschritt (wer bewusst wartet, hängt nicht).
    if (station !== "fertig" && farbe !== "rot") {
      if (a.labels.includes("needs-human") || pr?.labels.includes("needs-human")) rot("Hier muss ein Mensch entscheiden.");
      else if (farbe === "gruen" && station !== "geplant" && minuten(letzter, jetzt) > HAENGT_MIN) rot(`Seit ${Math.round(minuten(letzter, jetzt))} Minuten kein Fortschritt.`);
    }
    // Blau: ein laufendes Issue nennt dieses als Eltern- oder verwandtes Issue.
    const helfer = farbe === "rot" ? laeuftGerade.find((r) => r.issue !== a.issue && r.bezug.includes(a.issue)) : undefined;
    if (helfer) { farbe = "blau"; grund = `Repariert sich: ${helfer.issue} läuft.`; }

    return [{ issue: a.issue, titel: a.titel, produkt, station, farbe, grund, seit, haken: a.haken, links: { linear: linearUrl(a.issue), pr: pr?.url ?? null, run: ev.find((e) => e.run)?.run ?? null } }];
  });

  const brauchtDich: BrauchtDich[] = [
    ...prs.filter((p) => !p.entwurf && p.url && p.labels.includes("risk:high") && !p.labels.includes("freigegeben")).map((p) => ({ text: `${p.titel} wartet auf deine Freigabe`, url: p.url! })),
    ...aufgaben.filter((a) => a.labels.includes("sinan") && (a.status === "offen" || a.status === "laeuft")).map((a) => ({ text: `${a.issue} ${a.titel}`, url: linearUrl(a.issue) })),
  ].slice(0, 3);

  return {
    erzeugt: jetzt.toISOString(),
    produkte: PRODUKTE.map((id) => ({ id, karten: karten.filter((k) => k.produkt === id) })),
    brauchtDich,
    brauchtDichText: brauchtDich.length ? null : "Nichts – alles läuft",
  };
}
