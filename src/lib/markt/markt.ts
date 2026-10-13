// Markt-Agent (SIN-554): reine Logik. Ergebnis prüfen, Markdown-Tabelle bilden, Ideen begrenzen. Kein Netz.
// `scripts/markt/markt.ts` schreibt die Datei und legt die Linear-Issues an. Gesucht wird im Workflow (WebSearch/WebFetch), nicht hier.

export const SCHRITT = "markt";
export const MAX_IDEEN = 3;
export const MIN_ANBIETER = 3;
/** Linear: Label und Meilenstein der Ideen. Nie `dringend`, nie v1 (Issue SIN-554). */
export const IDEE_LABEL = "idee";
export const IDEE_MEILENSTEIN = "v2 Ideen";

export type Eintrag = { anbieter: string; funktion: string; preis: string; quelle: string; datum: string };
export type Botschaft = { anbieter: string; text: string; quelle: string };
export type Idee = { titel: string; beschreibung: string; quelle: string };
export type Ergebnis = { produkt: string; eintraege: Eintrag[]; botschaften: Botschaft[]; ideen: Idee[] };

const MAX_TEXT = 1000;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim().length > 0 && v.length <= MAX_TEXT ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const liste = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const quelle = (v: unknown): string | null => {
  const t = text(v);
  return t && /^https:\/\/[^\s|)]+$/.test(t) ? t : null;
};
const datum = (v: unknown): string | null => {
  const t = text(v);
  return t && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t)) ? t : null;
};

/** Prompt für den Workflow-Lauf. Belege nur aus abgerufenen Seiten, nichts raten. */
export function promptFuer(produkt: string, konkurrenz: string[], monat: string): string {
  return [
    `Du bist der Markt-Agent für „${produkt}“. Monat: ${monat}. Schreibe das Ergebnis als JSON in markt-ergebnis.json.`,
    `Prüfe diese Konkurrenz mit WebSearch und WebFetch: ${konkurrenz.join(", ")}.`,
    "Je Anbieter: neue Funktionen, Preise, Werbebotschaften. Jede Angabe braucht eine https-Quelle, die du abgerufen hast, und das Abrufdatum (JJJJ-MM-TT).",
    "Fehlt ein Beleg, lass die Angabe weg. Erfinde nichts. Preise nur, wenn die Seite sie nennt.",
    `Form: {produkt, eintraege[{anbieter,funktion,preis,quelle,datum}], botschaften[{anbieter,text,quelle}], ideen[{titel,beschreibung,quelle}]}. Mindestens ${MIN_ANBIETER} Anbieter, höchstens ${MAX_IDEEN} Ideen.`,
    "Ideen sind Erweiterungen für unser Produkt, die ein Konkurrent zeigt, und gehören nicht in v1.",
  ].join("\n");
}

/** Prüft das Ergebnis (Vertrauensgrenze). Null, wenn Belege fehlen oder weniger als MIN_ANBIETER Anbieter belegt sind. */
export function leseErgebnis(roh: unknown): Ergebnis | null {
  const o = obj(roh);
  const produkt = text(o.produkt);
  const eintraege: Eintrag[] = [];
  for (const x of liste(o.eintraege)) {
    const e = obj(x);
    const [anbieter, funktion, preis, q, d] = [text(e.anbieter), text(e.funktion), text(e.preis), quelle(e.quelle), datum(e.datum)];
    if (!anbieter || !funktion || !preis || !q || !d) return null;
    eintraege.push({ anbieter, funktion, preis, quelle: q, datum: d });
  }
  const botschaften: Botschaft[] = [];
  for (const x of liste(o.botschaften)) {
    const b = obj(x);
    const [anbieter, t, q] = [text(b.anbieter), text(b.text), quelle(b.quelle)];
    if (!anbieter || !t || !q) return null;
    botschaften.push({ anbieter, text: t, quelle: q });
  }
  const ideen: Idee[] = [];
  for (const x of liste(o.ideen)) {
    const i = obj(x);
    const [titel, beschreibung, q] = [text(i.titel), text(i.beschreibung), quelle(i.quelle)];
    if (!titel || !beschreibung || !q) return null;
    ideen.push({ titel, beschreibung, quelle: q });
  }
  if (!produkt || new Set(eintraege.map((e) => e.anbieter)).size < MIN_ANBIETER) return null;
  return { produkt, eintraege, botschaften, ideen: ideen.slice(0, MAX_IDEEN) };
}

export const pfad = (monat: string): string => `docs/markt/${monat}.md`;
export const istMonat = (s: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

const zelle = (s: string): string => s.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");

/** Inhalt von docs/markt/<YYYY-MM>.md. Die Werbebotschaften sind die Eingabe des Marketing-Agenten (`konkurrenz`). */
export function markdown(e: Ergebnis, monat: string): string {
  const z = [`# Markt ${monat}: ${e.produkt}`, "", "Von einem Agenten per WebFetch zusammengetragen. Angaben stehen für den genannten Abruftag; Preise vor Gebrauch prüfen.", "", "## Funktionen und Preise", "", "| Anbieter | Funktion | Preis | Quelle | Datum |", "| --- | --- | --- | --- | --- |"];
  for (const x of e.eintraege) z.push(`| ${zelle(x.anbieter)} | ${zelle(x.funktion)} | ${zelle(x.preis)} | ${x.quelle} | ${x.datum} |`);
  z.push("", "## Werbebotschaften", "");
  if (e.botschaften.length === 0) z.push("Keine belegt.");
  for (const b of e.botschaften) z.push(`- **${zelle(b.anbieter)}:** ${zelle(b.text)} ([Quelle](${b.quelle}))`);
  z.push("", "## Ideen", "");
  if (e.ideen.length === 0) z.push("Keine.");
  for (const i of e.ideen) z.push(`- **${zelle(i.titel)}:** ${zelle(i.beschreibung)} ([Quelle](${i.quelle}))`);
  return `${z.join("\n")}\n`;
}

/** Werbebotschaften als Eingabe für den Marketing-Agenten (`Eingabe.konkurrenz`). */
export const botschaftenFuerMarketing = (e: Ergebnis): string[] => e.botschaften.map((b) => `${b.anbieter}: ${b.text}`);

/** Beschreibung des Linear-Issues einer Idee. */
export const ideeBeschreibung = (i: Idee, monat: string): string => `${i.beschreibung}\n\nQuelle: ${i.quelle}\nMarkt-Agent ${monat}, siehe ${pfad(monat)}. Idee für v2: nimmt der CEO erst auf, wenn v1 fertig ist.`;

/** Zeile für `loop_events`. */
export const ereignisZeile = (produkt: string, ok: boolean, ideen: number) => ({ project: "leitstand", step: SCHRITT, status: ok ? "ok" : "fehler", issue: null, pr: null, payload: { produkt, ideen } });
