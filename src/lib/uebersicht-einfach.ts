// Ableitungen für die einfache Übersicht nach Figma F1/F2 (SIN-526). Rein; Eingabe sind nur echte Zeilen aus loop_events und loop_snapshot.
import { REPOS } from "./freigabe";
import { projektInfo } from "./projekte";
import { warnungen, type Warnung } from "./kosten/guthaben";
import { kontingente, letzte24h, type LoopEvent, type Quelle } from "./uebersicht";
import { aufgabenFuerDich, pipelineSchiene } from "./uebersicht-b1";
import type { WartenderPr } from "./wartende-prs";

const ROT = /fail|error|abort|crash|red|rot|stuck|timeout/i;
const BEGONNEN = /^(start|started|running|in_progress|active)$/i;

const zeit = (iso: string) => Date.parse(iso);
const tagBerlin = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
const neuesterZuerst = (a: LoopEvent, b: LoopEvent) => zeit(b.created_at) - zeit(a.created_at);

// ------------------------------------------------------------------ Lage in einem Satz

export type Lage = { satz: string; alarm: boolean };

const dinge = (n: number) => `${n} ${n === 1 ? "Ding wartet" : "Dinge warten"} auf dich`;

/** Ein Satz ohne Fachwörter. Rot in der Pipeline ergibt „Achtung“; ohne Daten null. */
export function lageSatz(q: Quelle, anzahlWartend: number, jetzt: Date): Lage | null {
  if (q.events.length === 0 && q.snapshot.length === 0) return null;
  const { grund } = pipelineSchiene(q.events, jetzt);
  if (grund) return { satz: `Achtung: Etwas ist kaputt.${anzahlWartend > 0 ? ` ${dinge(anzahlWartend)}.` : ""}`, alarm: true };
  if (anzahlWartend > 0) return { satz: `${dinge(anzahlWartend)}. Alles andere läuft von allein.`, alarm: false };
  return { satz: "Nichts zu tun. Alles läuft.", alarm: false };
}

// ------------------------------------------------------------------ Das musst du tun

export type Karte = { key: string; titel: string; warum: string; projekt: string; pr: string | null; minuten: number | null; wartender: WartenderPr | null; ansehen: string | null;
  /** Link zum Dienst für „Aufladen“ (SIN-555); wir zahlen nie selbst. */
  aufladen: string | null };

/** Guthaben unter 20 % und Kontingente über 80 % aus dem Snapshot. */
export const kostenWarnungen = (q: Quelle): Warnung[] => warnungen(q.snapshot.flatMap((s) => s.guthaben ?? []), kontingente(q.snapshot));

/** Wartende Freigaben (mit „Freigeben“) und offene Aufgaben für Sinan (nur „Ansehen“). Je PR einmal. */
export function karten(q: Quelle, wartende: WartenderPr[]): Karte[] {
  const kosten = kostenWarnungen(q).map<Karte>((w) => ({ key: w.key, titel: w.titel, warum: w.warum, projekt: "Kosten", pr: null, minuten: null, wartender: null, ansehen: "/kosten", aufladen: w.link }));
  const projektVon = (key: string) => q.snapshot.find((s) => key.startsWith(`${s.project}|`))?.project ?? null;
  const fuerPr = wartende.map<Karte>((p) => ({
    key: p.key,
    titel: p.titel,
    warum: p.grund,
    projekt: projektInfo(REPOS[p.repo].projekt).name,
    pr: `#${p.nummer}`,
    minuten: null,
    wartender: p,
    ansehen: p.url,
    aufladen: null,
  }));
  const bekannt = new Set(wartende.map((p) => `#${p.nummer}`));
  const aufgaben = aufgabenFuerDich(q.snapshot)
    .filter((a) => !bekannt.has(a.ref))
    .map<Karte>((a) => {
      const projekt = projektVon(a.key);
      return {
        key: a.key,
        titel: a.titel,
        warum: "Nur du kannst hier weitermachen.",
        projekt: projekt ? projektInfo(projekt).name : "",
        pr: /^#\d+$/.test(a.ref) ? a.ref : null,
        minuten: a.minuten,
        wartender: null,
        aufladen: null,
        ansehen: /^SIN-\d+$/.test(a.ref) ? `https://linear.app/sinan-kahraman/issue/${a.ref}` : null,
      };
    });
  return [...kosten, ...fuerPr, ...aufgaben];
}

// ------------------------------------------------------------------ Was gerade passiert

export const STATIONEN = [
  { id: "geplant", name: "Geplant", hinweis: "Steht auf der Liste" },
  { id: "gebaut", name: "Wird gebaut", hinweis: "Ein Agent schreibt Code" },
  { id: "geprueft", name: "Wird geprüft", hinweis: "Tests, Design, Barrierefreiheit" },
  { id: "wartet", name: "Wartet auf dich", hinweis: "Nur du kannst weitermachen" },
  { id: "live", name: "Ist live", hinweis: "Läuft bei den Nutzern" },
] as const;
export type StationId = (typeof STATIONEN)[number]["id"];

export type Eintrag = { key: string; titel: string; projekt: string; minuten: number | null;
  /** Beginn in der Station (ISO) für `zeitInWorten()`; null bei „Ist live“ und wartenden PRs (SIN-578). */
  seit: string | null; aktiv: boolean; rot: boolean };
export type Station = { id: StationId; name: string; hinweis: string; eintraege: Eintrag[] };

const STATION_VON_STUFE: Record<string, StationId> = { PLAN: "geplant", QUEUE: "geplant", WORK: "gebaut", PR: "geprueft", GATE: "geprueft", MERGE: "live", DEPLOY: "live" };

/** Fünf feste Stationen. Jedes Issue steht dort, wo sein jüngstes Ereignis liegt; „Ist live“ nur mit Ereignissen von heute. */
export function stationen(q: Quelle, wartende: WartenderPr[], jetzt: Date): Station[] {
  const heute = tagBerlin(jetzt);
  const ev = letzte24h(q.events, jetzt);
  const wartetPr = new Set(wartende.map((p) => p.nummer));
  const jeIssue = new Map<string, LoopEvent[]>();
  for (const e of ev) {
    const wer = e.issue ?? (e.pr ? `#${e.pr}` : null);
    if (!e.project || !wer || !e.step || !STATION_VON_STUFE[e.step.toUpperCase()]) continue;
    const k = `${e.project}|${wer}`;
    jeIssue.set(k, [...(jeIssue.get(k) ?? []), e]);
  }
  const aus = new Map<StationId, Eintrag[]>(STATIONEN.map((s) => [s.id, []]));
  for (const [key, liste] of jeIssue) {
    const sortiert = [...liste].sort(neuesterZuerst);
    const letztes = sortiert[0];
    if (letztes.pr && wartetPr.has(letztes.pr)) continue;
    const station = STATION_VON_STUFE[letztes.step!.toUpperCase()];
    if (station === "live" && tagBerlin(new Date(letztes.created_at)) !== heute) continue;
    const rot = !!letztes.status && ROT.test(letztes.status);
    const ersterInStation = Math.min(...sortiert.filter((e) => STATION_VON_STUFE[e.step!.toUpperCase()] === station).map((e) => zeit(e.created_at)));
    const zeile = q.snapshot.find((s) => s.project === letztes.project && !!letztes.issue && s.issue === letztes.issue);
    aus.get(station)!.push({
      key,
      titel: zeile?.title && zeile.title !== zeile.issue ? zeile.title : (letztes.issue ?? `PR #${letztes.pr}`),
      projekt: letztes.project!,
      minuten: station === "live" ? null : Math.max(0, Math.round((jetzt.getTime() - ersterInStation) / 60_000)),
      seit: station === "live" ? null : new Date(ersterInStation).toISOString(),
      aktiv: station === "gebaut" && !rot && !!letztes.status && BEGONNEN.test(letztes.status),
      rot,
    });
  }
  for (const p of wartende) {
    aus.get("wartet")!.push({ key: p.key, titel: p.titel, projekt: REPOS[p.repo].projekt, minuten: null, seit: null, aktiv: false, rot: false });
  }
  return STATIONEN.map((s) => ({ ...s, eintraege: aus.get(s.id)!.sort((a, b) => (b.minuten ?? -1) - (a.minuten ?? -1)) }));
}

// ------------------------------------------------------------------ Wie weit ist es?

export type Fortschritt = { project: string; fertig: number; gesamt: number; neueIdeen: number };

/** Je Projekt eine Zeile, nur wo der Snapshot einen Fortschritt liefert. */
export function fortschritt(q: Quelle): Fortschritt[] {
  const je = new Map<string, Fortschritt>();
  for (const s of q.snapshot) if (s.progress) je.set(s.project, { project: s.project, ...s.progress });
  return [...je.values()];
}

// ------------------------------------------------------------------ Heute fertig

export type Fertig = { key: string; satz: string; zeit: string };

/** Heute gemergte Issues, jüngste zuerst: ein Satz und der Zeitpunkt (ISO, für `zeitInWorten()`). Ohne Titel steht „Eine Aufgabe ist fertig“, nie eine Kennung (SIN-578). */
export function heuteFertig(q: Quelle, jetzt: Date): Fertig[] {
  const heute = tagBerlin(jetzt);
  const gesehen = new Set<string>();
  return [...q.events]
    .sort(neuesterZuerst)
    .flatMap((e) => {
      if (e.step?.toUpperCase() !== "MERGE" || (e.status && ROT.test(e.status))) return [];
      if (zeit(e.created_at) > jetzt.getTime() || tagBerlin(new Date(e.created_at)) !== heute) return [];
      const wer = e.issue ?? (e.pr ? `#${e.pr}` : e.id);
      const key = `${e.project}|${wer}`;
      if (gesehen.has(key)) return [];
      gesehen.add(key);
      const titel = q.snapshot.find((s) => s.project === e.project && !!e.issue && s.issue === e.issue)?.title;
      return [{ key, satz: titel && titel !== e.issue ? titel : "Eine Aufgabe ist fertig", zeit: e.created_at }];
    });
}
