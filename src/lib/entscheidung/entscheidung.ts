// Entscheidungs-Eingang (SIN-1012): Block im Linear-Issue lesen, Antwort als Kommentar zurückschreiben.
// Rein; das Linear-Netz kommt als `EntscheidungsNetz` herein (Umsetzung in ./netz.ts).

import type { Treffer } from "../autonomy/research";

export const LABEL_ENTSCHEIDUNG = "entscheidung";
export const ARTEN = ["design", "infrastruktur", "kosten", "zugang", "produkt"] as const;
export type Art = (typeof ARTEN)[number];
export const MARKER_ANTWORT = "<!-- entscheidung-antwort -->";

export type Option = { titel: string; folge: string };
export type Block = { frage: string; art: Art; optionen: Option[]; empfehlung: string; recherche: string[] };

const BLOCK_RE = /<!--\s*entscheidung\s+([\s\S]*?)\s*-->/;
const text = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** Liest `<!-- entscheidung {…} -->` aus der Issue-Beschreibung; fehlender oder kaputter Block ergibt null. */
export function leseBlock(beschreibung: string | null | undefined): Block | null {
  const m = BLOCK_RE.exec(String(beschreibung ?? ""));
  if (!m) return null;
  let roh: unknown;
  try {
    roh = JSON.parse(m[1]);
  } catch {
    return null;
  }
  const o = roh && typeof roh === "object" ? (roh as Record<string, unknown>) : null;
  if (!o || !text(o.frage) || !ARTEN.includes(o.art as Art) || !Array.isArray(o.optionen) || !o.optionen.length) return null;
  const optionen: Option[] = [];
  for (const x of o.optionen) {
    const p = x && typeof x === "object" ? (x as Record<string, unknown>) : null;
    if (!p || !text(p.titel)) return null;
    optionen.push({ titel: p.titel.trim(), folge: typeof p.folge === "string" ? p.folge : "" });
  }
  const recherche = Array.isArray(o.recherche) ? o.recherche.filter((r): r is string => typeof r === "string") : [];
  return { frage: o.frage.trim(), art: o.art as Art, optionen, empfehlung: typeof o.empfehlung === "string" ? o.empfehlung : "", recherche };
}

export type Antwort = { issue: string; option?: string; text?: string };

/** Prüft den Body von POST: Kennung und genau eins von `option` oder `text`. */
export function antwortEingabe(body: unknown): Antwort | null {
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (typeof o.issue !== "string" || !/^SIN-\d+$/.test(o.issue)) return null;
  const option = typeof o.option === "string" ? o.option.trim() : "";
  const frei = typeof o.text === "string" ? o.text.trim() : "";
  if ((option === "") === (frei === "")) return null;
  return option ? { issue: o.issue, option } : { issue: o.issue, text: frei };
}

/** Kommentar für Linear: Wahl, Datum (YYYY-MM-DD) und Marker, an dem der Gedächtnis-Agent die Antwort findet. */
export const antwortKommentar = (wahl: string, jetzt: Date): string => `Entscheidung Sinan (${jetzt.toISOString().slice(0, 10)}): ${wahl.trim()}\n\n${MARKER_ANTWORT}`;

export type OffeneEntscheidung = { identifier: string; titel: string; url: string; block: Block | null };
export type EntscheidungsNetz = {
  offene(): Promise<{ identifier: string; title: string; url: string; description: string | null }[]>;
  /** Beschreibung des Issues, damit die Wahl gegen die Optionen geprüft wird; null wenn unbekannt. */
  beschreibung(kennung: string): Promise<string | null>;
  /** Kommentar schreiben, Labels `entscheidung`/`needs-human` weg, `claude`/`gedaechtnis` dazu, Status Todo. */
  beantworten(kennung: string, kommentar: string): Promise<void>;
};

export async function offeneEntscheidungen(netz: EntscheidungsNetz): Promise<OffeneEntscheidung[]> {
  return (await netz.offene()).map((i) => ({ identifier: i.identifier, titel: i.title, url: i.url, block: leseBlock(i.description) }));
}

export type Ergebnis = { ok: true; kennung: string; wahl: string } | { ok: false; grund: "unbekannt" | "option" | "linear" };

/** Schreibt die Antwort nach Linear. `option` muss eine Option des Blocks sein; `text` ist die freie Antwort. */
export async function beantworte(netz: EntscheidungsNetz, antwort: Antwort, jetzt = new Date()): Promise<Ergebnis> {
  try {
    const block = leseBlock(await netz.beschreibung(antwort.issue));
    if (!block) return { ok: false, grund: "unbekannt" };
    if (antwort.option !== undefined && !block.optionen.some((o) => o.titel === antwort.option)) return { ok: false, grund: "option" };
    const wahl = (antwort.option ?? antwort.text) as string;
    await netz.beantworten(antwort.issue, antwortKommentar(wahl, jetzt));
    return { ok: true, kennung: antwort.issue, wahl };
  } catch {
    return { ok: false, grund: "linear" };
  }
}

/** Zeile für `loop_events` (Schritt `entscheidung`); Schlüssel wie in `ideeZeile`. */
export const entscheidungZeile = (kennung: string, ergebnis: Ergebnis) => ({
  project: "leitstand",
  step: "entscheidung",
  status: ergebnis.ok ? "ok" : "fehler",
  issue: kennung,
  pr: null,
  ...(ergebnis.ok ? {} : { grund: ergebnis.grund }),
});

// SIN-1014: Agenten fragen über `entscheidung` statt `needs-human`; Routinefehler bleiben bei `needs-human`.
const STICHWORTE: [Art, RegExp][] = [
  ["zugang", /neues?\s+(secret|konto|token|api[- ]?key)|secret fehlt|zugang/i],
  ["kosten", /kosten|bezahl|\babo\b|guthaben/i],
  ["design", /neue\s+(komponente|farbe)|neues?\s+token/i],
  ["infrastruktur", /framework-?wechsel|(datenbank|db)-?wechsel/i],
  ["produkt", /umfang/i],
];

/** Art der echten Entscheidung aus dem Grund; Routinefehler (Test rot, Reparaturrunden, Prüfer-Fund) ergeben null. */
export function istEchteEntscheidung(grund: string): Art | null {
  return STICHWORTE.find(([, re]) => re.test(grund))?.[0] ?? null;
}

export const MAX_RECHERCHE = 5;
const HALB_JAHR_MS = 183 * 24 * 3600 * 1000;

/** Regeln aus AGENTS.md: MIT/Apache, letzter Commit < 6 Monate, > 500 Sterne. */
export const erfuelltRegeln = (t: Treffer, jetzt: Date): boolean =>
  /^(MIT|Apache-2\.0)$/i.test(t.lizenz) && t.sterne > 500 && !!t.letzterCommit && jetzt.getTime() - Date.parse(t.letzterCommit) < HALB_JAHR_MS;

/** Baut `<!-- entscheidung {…} -->` für die Issue-Beschreibung; höchstens 5 Treffer, die Empfehlung nennt den ersten, der die Regeln erfüllt. */
export function baueBlock(e: { frage: string; art: Art; optionen: Option[]; empfehlung: string; recherche: Treffer[] }, jetzt = new Date()): string {
  const treffer = e.recherche.slice(0, MAX_RECHERCHE);
  const passend = treffer.find((t) => erfuelltRegeln(t, jetzt));
  const empfehlung = passend ? `${e.empfehlung} Treffer ${passend.name} erfüllt die Regeln (${passend.lizenz}, ${passend.sterne} Sterne, letzter Commit ${passend.letzterCommit}).`.trim() : e.empfehlung;
  const recherche = treffer.map((t) => `${t.name} ${t.url} · ${t.lizenz} · ${t.sterne} Sterne · letzter Commit ${t.letzterCommit ?? "unbekannt"}`);
  const block: Block = { frage: e.frage, art: e.art, optionen: e.optionen, empfehlung, recherche };
  return `<!-- entscheidung ${JSON.stringify(block).replace(/-->/g, "--\\u003e")} -->`;
}
