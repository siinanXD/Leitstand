// Ableitungen für die Übersicht nach Figma B1/B2 (SIN-509). Rein; Eingabe sind nur echte Zeilen aus loop_events und loop_snapshot.
import { berlinerTag } from "./berlin";
import { STUFEN, brauchtDich, laufend, letzte24h, type LoopEvent, type Quelle, type SnapshotRow } from "./uebersicht";

const ROT = /fail|error|abort|crash|red|rot|stuck|timeout/i;
const BEGONNEN = /^(start|started|running|in_progress|active)$/i;
const FERTIG = /^(done|merged|closed)$/i;

const zeit = (iso: string) => Date.parse(iso);
const taktKey = (p: string, i: string) => `${p}|${i}`;
const neuesterZuerst = (a: LoopEvent, b: LoopEvent) => zeit(b.created_at) - zeit(a.created_at);

export const uhrzeitBerlin = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
const tagBerlin = (d: Date) => berlinerTag(d);

export type StufeZustand = "ok" | "laufend" | "rot" | "leer";
export type SchienenStufe = { stage: string; zustand: StufeZustand; anzahl: number };

/** Pipeline-Schiene aus den Ereignissen der 24 h: Zustand je Stufe nach dem jüngsten Ereignis, bei Rot Grundzeile (seit wann, Issue). */
export function pipelineSchiene(events: LoopEvent[], jetzt: Date): { stufen: SchienenStufe[]; grund: string | null } {
  const ev = letzte24h(events, jetzt).sort(neuesterZuerst);
  if (ev.length === 0) return { stufen: [], grund: null };
  let grund: string | null = null;
  const stufen = STUFEN.map((stage) => {
    const hier = ev.filter((e) => e.step?.toUpperCase() === stage);
    if (hier.length === 0) return { stage, zustand: "leer" as const, anzahl: 0 };
    const letztes = hier[0];
    const rot = !!letztes.status && ROT.test(letztes.status);
    if (rot) {
      // „seit“ = ältestes Ereignis der letzten durchgehenden Rot-Reihe
      let seit = letztes;
      for (const e of hier) {
        if (!e.status || !ROT.test(e.status)) break;
        seit = e;
      }
      const wer = letztes.issue ?? (letztes.pr ? `#${letztes.pr}` : null);
      grund ??= `${stage} rot: seit ${uhrzeitBerlin(seit.created_at)}${wer ? ` (${wer})` : ""}.`;
      return { stage, zustand: "rot" as const, anzahl: 0 };
    }
    const offen = stage === "WORK" ? offeneLaeufe(ev).length : 0;
    const laeuft = !!letztes.status && BEGONNEN.test(letztes.status);
    return { stage, zustand: laeuft || offen > 0 ? ("laufend" as const) : ("ok" as const), anzahl: offen };
  });
  return { stufen, grund };
}

/** Worker-Läufe, deren jüngstes Ereignis ein WORK-Start ist. */
function offeneLaeufe(ev: LoopEvent[]): LoopEvent[] {
  const letzte = new Map<string, LoopEvent>();
  for (const e of ev) {
    if (!e.project || !e.issue) continue;
    const k = taktKey(e.project, e.issue);
    const alt = letzte.get(k);
    if (!alt || zeit(e.created_at) > zeit(alt.created_at)) letzte.set(k, e);
  }
  return [...letzte.values()].filter((e) => e.step?.toUpperCase() === "WORK" && !!e.status && BEGONNEN.test(e.status));
}

export type ArbeitsZeile = { key: string; project: string; issue: string | null; titel: string | null; dauerMin: number | null; kosten: number | null };

/** „In Arbeit“: Linear „In Progress“ (Snapshot) oder offener Worker-Lauf; Issues mit späterem MERGE/Done-Ereignis fallen heraus. */
export function inArbeitZeilen(q: Quelle, jetzt: Date): ArbeitsZeile[] {
  const ev = letzte24h(q.events, jetzt);
  const fertigSeit = new Map<string, number>();
  for (const e of ev) {
    if (!e.project || !e.issue) continue;
    if (e.step?.toUpperCase() === "MERGE" || (e.status && FERTIG.test(e.status))) {
      const k = taktKey(e.project, e.issue);
      fertigSeit.set(k, Math.max(fertigSeit.get(k) ?? 0, zeit(e.created_at)));
    }
  }
  return laufend(q, jetzt).flatMap((r: SnapshotRow) => {
    const k = taktKey(r.project, r.issue ?? (r.pr ? `#${r.pr}` : (r.title ?? "")));
    const gleich = (e: LoopEvent) => !!r.issue && e.project === r.project && e.issue === r.issue;
    const start = ev.filter((e) => gleich(e) && e.step?.toUpperCase() === "WORK" && !!e.status && BEGONNEN.test(e.status));
    const ersterStart = start.length ? Math.min(...start.map((e) => zeit(e.created_at))) : r.updated_at ? zeit(r.updated_at) : null;
    if (fertigSeit.has(k) && fertigSeit.get(k)! >= (ersterStart ?? 0)) return [];
    const kosten = ev.filter((e) => gleich(e) && e.cost !== null).reduce((a, e) => a + (e.cost ?? 0), 0);
    const hat = ev.some((e) => gleich(e) && e.cost !== null);
    return [{ key: k, project: r.project, issue: r.issue, titel: r.title && r.title !== r.issue ? r.title : null, dauerMin: ersterStart ? Math.max(0, Math.round((jetzt.getTime() - ersterStart) / 60_000)) : null, kosten: hat ? kosten : null }];
  });
}

export type Aufgabe = { key: string; titel: string; minuten: number | null; ref: string };

const OFFEN = (s: SnapshotRow) => !s.status || !FERTIG.test(s.status);

/** „Braucht dich“: offene Issues mit Label `sinan`, PRs mit `risk:high` ohne `freigegeben`, plus Zeilen im Status „wartet“. */
export function aufgabenFuerDich(snapshot: SnapshotRow[]): Aufgabe[] {
  const zeilen = new Map<string, SnapshotRow>();
  for (const r of snapshot) {
    const sinan = r.labels.includes("sinan") && OFFEN(r);
    const risiko = r.labels.includes("risk:high") && !r.labels.includes("freigegeben") && OFFEN(r);
    if (sinan || risiko) zeilen.set(`${r.project}|${r.issue ?? r.pr ?? r.title ?? ""}`, r);
  }
  for (const r of brauchtDich(snapshot)) zeilen.set(`${r.project}|${r.issue ?? r.pr ?? r.title ?? ""}`, r);
  return [...zeilen].map(([key, r]) => ({
    key,
    titel: r.title ?? (r.pr ? `PR #${r.pr}` : (r.issue ?? r.project)),
    minuten: r.minutes ?? (r.labels.flatMap((l) => (/^min:(\d+)$/.exec(l) ? [Number(l.slice(4))] : []))[0] ?? null),
    ref: r.issue ?? (r.pr ? `#${r.pr}` : r.project),
  }));
}

/** Link zum Linear-Issue zum Antworten (SIN-651): Kennung der Aufgabe, sonst die erste Kennung im Titel (PR-Titel enden auf „(SIN-xyz)“). */
export function linearLink(a: Pick<Aufgabe, "ref" | "titel">): string | null {
  const id = /^SIN-\d+$/.test(a.ref) ? a.ref : /\bSIN-\d+\b/.exec(a.titel)?.[0];
  return id ? `https://linear.app/sinan-kahraman/issue/${id}` : null;
}

export type Kennzahl = { label: string; wert: string; hervor: boolean };

/** Kacheln nur mit echter Quelle: „Produktreife“ und „Prognose fertig“ fehlen, solange es dafür keine Daten gibt. */
export function kennzahlen(q: Quelle, jetzt: Date): Kennzahl[] {
  if (q.events.length === 0 && q.snapshot.length === 0) return [];
  const heute = tagBerlin(jetzt);
  const gemergt = new Set(
    q.events.filter((e) => e.step?.toUpperCase() === "MERGE" && !(e.status && ROT.test(e.status)) && tagBerlin(new Date(e.created_at)) === heute).map((e) => `${e.project}|${e.issue ?? e.pr ?? e.id}`),
  ).size;
  const wartet = aufgabenFuerDich(q.snapshot).length;
  return [
    { label: "Gemergt heute", wert: String(gemergt), hervor: false },
    { label: "Braucht dich", wert: String(wartet), hervor: wartet > 0 },
    { label: "In Arbeit", wert: String(inArbeitZeilen(q, jetzt).length), hervor: false },
    { label: "Ereignisse 24 h", wert: String(letzte24h(q.events, jetzt).length), hervor: false },
  ];
}

export type Kachel = { anzahl: number; stufe: 0 | 1 | 2 | 3; rot: boolean };

/** 24 Kacheln, älteste zuerst. Stufe nach Anteil an der Spitze; rot = in der Stunde gab es ein Fehler-Ereignis (Stillstand). */
export function aktivitaetKacheln(events: LoopEvent[], jetzt: Date): Kachel[] {
  const k = Array.from({ length: 24 }, () => ({ anzahl: 0, rot: false }));
  for (const e of letzte24h(events, jetzt)) {
    const i = 23 - Math.min(23, Math.floor((jetzt.getTime() - zeit(e.created_at)) / 3_600_000));
    k[i].anzahl += 1;
    if (e.status && ROT.test(e.status)) k[i].rot = true;
  }
  const spitze = Math.max(...k.map((x) => x.anzahl), 1);
  return k.map((x) => ({ ...x, stufe: x.anzahl === 0 ? 0 : (Math.min(3, Math.ceil((x.anzahl / spitze) * 3)) as 1 | 2 | 3) }));
}

/** Beleg-Chips: PR-Nummern und Issue-Kennungen der jüngsten Ereignisse, ohne Doppelte. */
export function belegChips(events: LoopEvent[], jetzt: Date, max = 5): string[] {
  const chips: string[] = [];
  for (const e of letzte24h(events, jetzt).sort(neuesterZuerst)) {
    for (const c of [e.pr ? `#${e.pr}` : null, e.issue]) if (c && !chips.includes(c)) chips.push(c);
    if (chips.length >= max) break;
  }
  return chips.slice(0, max);
}
