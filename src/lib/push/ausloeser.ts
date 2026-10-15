// Auslöser für Mitteilungen (SIN-426, Figma E0 31:3). Rein: Zeit und Zustand kommen von außen, nichts wird gesendet.
import { BEREICHE, type Bereich } from "../bereiche";
import type { Nachricht } from "./push";

export type Art = "braucht-dich" | "alarm" | "selbst-behoben" | "fertig" | "abbruch";

/** Überschrift je Art. „Fertig“ und „Abbruch“ (Sinan 13.10.) folgen den Regeln von „Braucht dich“: tagsüber sofort, nachts gesammelt ab 07:00. */
const KOPF: Record<Art, string> = { "braucht-dich": "Braucht dich", alarm: "Alarm", "selbst-behoben": "Selbst behoben", fertig: "Fertig und live", abbruch: "Worker abgebrochen" };
const SOFORT_TAGSUEBER: ReadonlySet<Art> = new Set(["braucht-dich", "fertig", "abbruch"]);

export type Ereignis = {
  /** Stabile Kennung des Vorfalls; dasselbe Ereignis löst nie zweimal aus. */
  id: string;
  art: Art;
  projekt: string;
  /** Kennung wie SIN-426 oder PR-12. */
  kennung: string;
  titel: string;
  bereiche?: readonly Bereich[];
  /** Zeitpunkt des Ereignisses (ms seit 1970). */
  zeit: number;
  url?: string;
};

/** Schon gesendete Schlüssel (Ereignisse, Erinnerungen, Auswertungen). */
export type Gesendet = ReadonlySet<string>;

export type Plan = {
  nachrichten: Nachricht[];
  /** Schlüssel, die nach erfolgreichem Senden als gesendet zu speichern sind. */
  neu: string[];
};

export const ZEITZONE = "Europe/Berlin";
export const RUHE_VON = 22;
export const RUHE_BIS = 7;
export const AUSWERTUNG_STUNDE = 20;
export const LOOP_STILLSTAND_MS = 30 * 60_000;
export const SPAETER_MS = 60 * 60_000;

const berlin = new Intl.DateTimeFormat("en-CA", { timeZone: ZEITZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });

/** Berliner Datum (JJJJ-MM-TT) und Stunde; Sommer- und Winterzeit rechnet die Zeitzonen-Datenbank. */
export function berlinZeit(ms: number): { tag: string; stunde: number } {
  const teile = Object.fromEntries(berlin.formatToParts(ms).map((t) => [t.type, t.value]));
  return { tag: `${teile.year}-${teile.month}-${teile.day}`, stunde: Number(teile.hour) };
}

/** Ruhe von 22:00 bis 07:00 Berliner Zeit. */
export function inRuhe(ms: number): boolean {
  const { stunde } = berlinZeit(ms);
  return stunde >= RUHE_VON || stunde < RUHE_BIS;
}

/** Zeile „Ändert Frontend, Datenbank“ in fester Reihenfolge; leer ohne Bereiche. */
export function bereicheZeile(bereiche: readonly Bereich[] | undefined): string {
  const liste = BEREICHE.filter((b) => bereiche?.includes(b));
  return liste.length ? `Ändert ${liste.join(", ")}` : "";
}

const kurz = (s: string, max = 80): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

const vereinigt = (ereignisse: readonly Ereignis[]): Bereich[] => BEREICHE.filter((b) => ereignisse.some((e) => e.bereiche?.includes(b)));

/** Text höchstens 2 Zeilen: Projekt und Kennung vorne, darunter die Bereiche. */
const zweiZeilen = (erste: string, bereiche: readonly Bereich[] | undefined): string => [kurz(erste), bereicheZeile(bereiche)].filter(Boolean).join("\n");

export function nachrichtFuer(e: Ereignis, erinnerung = false): Nachricht {
  const kopf = KOPF[e.art];
  return {
    titel: erinnerung ? `Erinnerung: ${kopf}` : kopf,
    text: zweiZeilen(`${[e.projekt, e.kennung].filter(Boolean).join(" ")}: ${e.titel}`, e.bereiche),
    url: e.url ?? "/",
  };
}

function gebuendelt(ereignisse: readonly Ereignis[]): Nachricht {
  const projekte = [...new Set(ereignisse.map((e) => e.projekt))].join(", ");
  return {
    titel: `${new Set(ereignisse.map((e) => e.art)).size === 1 ? KOPF[ereignisse[0].art] : "Neues"} (${ereignisse.length})`,
    text: zweiZeilen(`${projekte}: ${ereignisse.map((e) => e.kennung || e.titel).join(", ")}`, vereinigt(ereignisse)),
    url: "/",
  };
}

/** Tages-Auswertung: selbst Behobenes und was auf dich wartet; gesammelt, nie einzeln. */
function auswertung(behoben: readonly Ereignis[], wartend: readonly Ereignis[]): Nachricht {
  const erste = `${behoben.length} selbst behoben, ${wartend.length} warten auf dich`;
  return { titel: "Auswertung", text: zweiZeilen(erste, vereinigt(behoben)), url: "/auswertung" };
}

export const auswertungsSchluessel = (tag: string): string => `auswertung:${tag}`;
export const erinnerungsSchluessel = (id: string, ab: number): string => `spaeter:${id}:${ab}`;

/** „Später“ aus E2: Erinnerung nach 1 Stunde. */
export type Erinnerung = { ereignis: Ereignis; faelligAb: number };
export const spaeter = (ereignis: Ereignis, jetzt: number): Erinnerung => ({ ereignis, faelligAb: jetzt + SPAETER_MS });

/**
 * Entscheidet bei jedem (stündlichen) Lauf, was jetzt rausgeht.
 * - Alarm: sofort, auch nachts.
 * - Braucht dich: sofort; in der Ruhe wartet es und kommt ab 07:00 gesammelt.
 * - Selbst behoben: nur in der Auswertung um 20:00 (einmal pro Berliner Tag).
 * - Erinnerungen („Später“): wie Braucht dich, ab fälliger Zeit; Erinnerungen an Alarme auch nachts.
 */
export function plane(ereignisse: readonly Ereignis[], gesendet: Gesendet, jetzt: number, erinnerungen: readonly Erinnerung[] = []): Plan {
  const nachrichten: Nachricht[] = [];
  const neu: string[] = [];
  const ruhe = inRuhe(jetzt);
  const frisch = new Map<string, Ereignis>();
  for (const e of ereignisse) if (!gesendet.has(e.id) && !frisch.has(e.id)) frisch.set(e.id, e);
  const offen = [...frisch.values()];

  for (const e of offen.filter((x) => x.art === "alarm")) {
    nachrichten.push(nachrichtFuer(e));
    neu.push(e.id);
  }

  const braucht = offen.filter((x) => SOFORT_TAGSUEBER.has(x.art));
  if (!ruhe) {
    const nachts = braucht.filter((x) => inRuhe(x.zeit));
    // Mehr als drei auf einmal (z. B. erster Lauf nach einer Pause): eine gesammelte Mitteilung statt einer Flut.
    const tags = braucht.filter((x) => !nachts.includes(x));
    if (tags.length > 3) nachrichten.push(gebuendelt(tags));
    else for (const e of tags) nachrichten.push(nachrichtFuer(e));
    neu.push(...tags.map((e) => e.id));
    if (nachts.length === 1) nachrichten.push(nachrichtFuer(nachts[0]));
    else if (nachts.length > 1) nachrichten.push(gebuendelt(nachts));
    neu.push(...nachts.map((e) => e.id));
  }

  for (const r of erinnerungen) {
    const schluessel = erinnerungsSchluessel(r.ereignis.id, r.faelligAb);
    if (r.faelligAb > jetzt || gesendet.has(schluessel) || neu.includes(schluessel)) continue;
    if (ruhe && r.ereignis.art !== "alarm") continue;
    nachrichten.push(nachrichtFuer(r.ereignis, true));
    neu.push(schluessel);
  }

  const { tag, stunde } = berlinZeit(jetzt);
  const schluessel = auswertungsSchluessel(tag);
  // Ab 20 Uhr bis zur Ruhe: fällt der Lauf um 20 Uhr aus, kommt sie beim nächsten (SIN-635). Der Tagesschlüssel verhindert Doppeltes.
  if (stunde >= AUSWERTUNG_STUNDE && !ruhe && !gesendet.has(schluessel)) {
    const behoben = offen.filter((x) => x.art === "selbst-behoben");
    const wartend = braucht.filter((x) => x.art === "braucht-dich" && !neu.includes(x.id));
    nachrichten.push(auswertung(behoben, wartend));
    neu.push(schluessel, ...behoben.map((e) => e.id));
  }

  return { nachrichten, neu };
}

/** Braucht dich: Freigabe, Entscheidung oder Aufgabe mit Label `sinan`. */
export type Offenes = { id: string; art: "freigabe" | "entscheidung" | "aufgabe"; labels?: readonly string[] };
export const brauchtDich = (o: Offenes): boolean => o.art !== "aufgabe" || (o.labels ?? []).includes("sinan");

/** Alarm-Bedingungen: Produktion nicht erreichbar, `main` rot oder Loop steht länger als 30 Minuten. Zeiten sind der Beginn des Vorfalls. */
export type Lage = { produktionDownSeit?: number | null; mainRotSeit?: number | null; letzterLoopLauf?: number | null };

export function alarmeAus(lage: Lage, projekt: string, jetzt: number): Ereignis[] {
  const alarme: Ereignis[] = [];
  if (lage.produktionDownSeit != null) alarme.push({ id: `alarm:produktion:${lage.produktionDownSeit}`, art: "alarm", projekt, kennung: "Produktion", titel: "nicht erreichbar", zeit: lage.produktionDownSeit });
  if (lage.mainRotSeit != null) alarme.push({ id: `alarm:main-rot:${lage.mainRotSeit}`, art: "alarm", projekt, kennung: "main", titel: "Build ist rot", zeit: lage.mainRotSeit });
  if (lage.letzterLoopLauf != null && jetzt - lage.letzterLoopLauf > LOOP_STILLSTAND_MS)
    alarme.push({ id: `alarm:loop:${lage.letzterLoopLauf}`, art: "alarm", projekt, kennung: "Loop", titel: "steht länger als 30 Minuten", zeit: lage.letzterLoopLauf });
  return alarme;
}

// ------------------------------------------------------------------ Quellen (SIN-421)

/** Was die Startseite unter „Was brauche ich von dir?“ zeigt, als Ereignis. Ohne Kennung im Text (SIN-578): Projekt und Titel reichen. */
export type Wartendes = { key: string; titel: string; projekt: string; url?: string };
export const brauchtDichAus = (liste: readonly Wartendes[], jetzt: number): Ereignis[] =>
  liste.map((w) => ({ id: `braucht:${w.key}`, art: "braucht-dich", projekt: w.projekt, kennung: "", titel: w.titel, zeit: jetzt, url: w.url ?? "/" }));

/** Schlange je Projekt aus `loop_snapshot.queue` und das jüngste Ereignis aus `loop_events` (ms). */
export type Schlange = { projekt: string; name: string; startbar: number; laeuft: number; pausiert: boolean; letztesEreignis: number | null };

/**
 * Stillstand: Arbeit liegt bereit, nichts läuft, keine Pause, seit über 30 Minuten kein Ereignis.
 * Als „Braucht dich“, nicht als Alarm: nachts ist ein stehender Loop kein Notfall (Ruhezeit gilt).
 */
export function stillstandAus(schlangen: readonly Schlange[], jetzt: number): Ereignis[] {
  return schlangen
    .filter((s) => s.startbar > 0 && s.laeuft === 0 && !s.pausiert && s.letztesEreignis != null && jetzt - s.letztesEreignis > LOOP_STILLSTAND_MS)
    .map((s) => ({ id: `stillstand:${s.projekt}:${s.letztesEreignis}`, art: "braucht-dich", projekt: s.name, kennung: "", titel: "Loop steht, obwohl Arbeit bereitliegt", zeit: jetzt, url: "/" }));
}

/** Rolle außerhalb ihres Takts (SIN-736, `docs/autonomy/rollen.json`): nur periodische Rollen lösen Alarm aus, Hinweise nicht. */
export const rollenStillstandAus = (befunde: readonly { rolle: string; urteil: string; alterH: number | null }[], projekt: string, jetzt: number): Ereignis[] =>
  befunde
    .filter((b) => b.urteil === "alarm" && b.alterH != null)
    .map((b) => ({ id: `alarm:rolle:${b.rolle}:${Math.floor(jetzt / 86_400_000)}`, art: "alarm", projekt, kennung: b.rolle, titel: `Rolle ${b.rolle} lief seit ${Math.round(b.alterH!)} Stunden nicht`, zeit: jetzt }));

/** Planer-Anstöße ohne startbare Todos (SIN-700): „Braucht dich“, solange der Vorfall in den letzten 24 Stunden liegt. */
export type PlanerVorfall = { projekt: string; name: string; zeit: number };
export const planerOhneTodosAus = (vorfaelle: readonly PlanerVorfall[], jetzt: number): Ereignis[] =>
  vorfaelle
    .filter((v) => jetzt - v.zeit < 24 * 3_600_000)
    .map((v) => ({ id: `planer-ohne-todos:${v.projekt}:${v.zeit}`, art: "braucht-dich", projekt: v.name, kennung: "", titel: "Planer liefert keine startbaren Todos", zeit: v.zeit, url: "/" }));

/** PR-Titel ohne Präfix und Kennung: „feat(push): Mitteilungen senden (SIN-421)“ → „Mitteilungen senden“. */
export function menschlich(titel: string): string {
  const t = titel.replace(/^\w+(\([^)]*\))?!?:\s*/, "").replace(/\s*\(SIN-\d+\)\s*$/, "").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : titel;
}

/** Gemergter PR je Repo. Nur `feat` und `fix` zählen als „fertig“, Pflege (chore, docs, ci) nicht. Älter als 6 Stunden: nicht mehr melden. */
export type GemergterPr = { repo: string; projekt: string; nummer: number; titel: string; gemergt: number };
export const FERTIG_FENSTER_MS = 6 * 3_600_000;
/** Nachts Gemergtes wartet die Ruhezeit ab (höchstens 9 h) und kommt morgens: dafür gilt ein Fenster von 10 Stunden (SIN-593). */
export const FERTIG_FENSTER_NACHT_MS = 10 * 3_600_000;
export const fertigGueltig = (gemergt: number, jetzt: number): boolean =>
  jetzt - gemergt <= (inRuhe(gemergt) ? FERTIG_FENSTER_NACHT_MS : FERTIG_FENSTER_MS);
export const fertigAus = (prs: readonly GemergterPr[], jetzt: number): Ereignis[] =>
  prs
    .filter((p) => /^(feat|fix)(\(|!|:)/.test(p.titel) && fertigGueltig(p.gemergt, jetzt))
    .map((p) => ({ id: `fertig:${p.repo}#${p.nummer}`, art: "fertig", projekt: p.projekt, kennung: "", titel: menschlich(p.titel), zeit: p.gemergt, url: "/" }));

/** Worker-Lauf je Aufgabe. `ergebnis` wie bei GitHub: success, failure, cancelled, skipped. */
export type WorkerLauf = { repo: string; projekt: string; issue: string; titel: string; ergebnis: string; ende: number };
export const ABBRUCH_FENSTER_MS = 60 * 60_000;

/** Letzter echter Lauf einer Aufgabe ist gescheitert, liegt unter einer Stunde zurück und es gibt keinen PR dazu: einmal am Tag melden, nicht bei jedem Versuch. */
export function abbruchAus(laeufe: readonly WorkerLauf[], jetzt: number, mitPr: ReadonlySet<string> = new Set()): Ereignis[] {
  const letzte = new Map<string, WorkerLauf>();
  for (const l of laeufe) {
    if (l.ergebnis !== "success" && l.ergebnis !== "failure") continue;
    const k = `${l.repo}|${l.issue}`;
    const alt = letzte.get(k);
    if (!alt || l.ende > alt.ende) letzte.set(k, l);
  }
  return [...letzte.values()]
    // Der Leitstand-Worker meldet manchmal „error“ erst nach dem PR: gibt es für die Aufgabe einen PR, ist nichts abgebrochen.
    .filter((l) => l.ergebnis === "failure" && jetzt - l.ende <= ABBRUCH_FENSTER_MS && !mitPr.has(l.issue))
    .map((l) => ({ id: `abbruch:${l.repo}:${l.issue}:${berlinZeit(l.ende).tag}`, art: "abbruch", projekt: l.projekt, kennung: "", titel: l.titel, zeit: l.ende, url: "/" }));
}
