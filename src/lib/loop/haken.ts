/**
 * Fertig-Kriterien (SIN-754): Ein Issue wird nur Done, wenn alle `- [ ]`-Haken im Issue-Text durch den PR belegt sind.
 * Rein, ohne Netz. Der Prüfer liefert je Haken `belegt` mit Beleg, scripts/loop/loop.ts setzt Haken und Status.
 */

export const MAX_RUNDEN = 2;
/** Marker im Linear-Kommentar; gezählt werden die Runden daran. */
export const RUNDE_MARKER = "<!-- haken-runde -->";
const HAKEN_MARKER = /<!-- pruefer-haken:([A-Za-z0-9+/=]+) -->/;
const ZEILE = /^(\s*[-*]\s+\[)([ xX])(\]\s+)(.+?)\s*$/;

export type Haken = { text: string; erledigt: boolean };
export type Beleg = { text: string; belegt: boolean; beleg: string; art?: "code" | "live" | "entscheidung" };
export type PruefStand = { head: string; auftrag: string };

const norm = (s: string) => s.replace(/[`*_]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export function leseHaken(beschreibung: string | null | undefined): Haken[] {
  return String(beschreibung ?? "").split("\n").flatMap((z) => {
    const m = ZEILE.exec(z);
    return m ? [{ text: m[4], erledigt: m[2] !== " " }] : [];
  });
}

/** Setzt die belegten Haken auf `- [x]`; erledigte bleiben erledigt. */
export function setzeHaken(beschreibung: string, belegte: string[]): string {
  const ziel = new Set(belegte.map(norm));
  return beschreibung.split("\n").map((z) => {
    const m = ZEILE.exec(z);
    return m && ziel.has(norm(m[4])) ? `${m[1]}x${m[3]}${m[4]}` : z;
  }).join("\n");
}

/** „Part of“ im PR-Titel oder -Text: das Issue bleibt offen, egal was der Prüfer sagt. */
export const istTeil = (titel: string, text: string | null | undefined) => /\bPart of SIN-\d+/i.test(`${titel}\n${text ?? ""}`);

export type Entscheidung = { status: "done" | "offen" | "wartet" | "needs-human"; belegt: string[]; offen: string[]; grund: string };

/**
 * Done nur mit aktuellem, nicht leerem Beleg für jeden Haken und ohne „Part of“.
 * Fehlende Kriterien bleiben offen. Ab MAX_RUNDEN Wiederaufnahmen: needs-human.
 * `belege` fehlt (Prüfer nicht gelaufen) = nichts belegt.
 */
export function entscheide(a: { haken: Haken[]; belege: Beleg[] | null; teil: boolean; runde: number }): Entscheidung {
  const belegtSet = new Set((a.belege ?? []).filter((b) => b.belegt && b.beleg.trim() && (b.art !== "live" || /https:\/\/\S+/.test(b.beleg))).map((b) => norm(b.text)));
  const offeneHaken = a.haken;
  const belegt = offeneHaken.filter((h) => belegtSet.has(norm(h.text))).map((h) => h.text);
  const offen = offeneHaken.filter((h) => !belegtSet.has(norm(h.text))).map((h) => h.text);
  if (!a.teil && a.haken.length > 0 && offen.length === 0) return { status: "done", belegt, offen, grund: "alle Haken aktuell belegt" };
  const grund = a.teil ? "PR ist „Part of“, Issue bleibt offen" : !a.haken.length ? "Fertig-Kriterien fehlen; vor Wiederaufnahme konkretisieren" : `${offen.length} Haken offen`;
  if (offen.length && offen.every((text) => a.belege?.some((b) => norm(b.text) === norm(text) && (b.art === "live" || b.art === "entscheidung")))) return { status: "wartet", belegt, offen, grund: "Live-Nachweis oder Entscheidung ausstehend; kein blinder Neubau" };
  return { status: a.runde >= MAX_RUNDEN ? "needs-human" : "offen", belegt, offen, grund };
}

export const zaehler = (haken: Haken[]) => `${haken.filter((h) => h.erledigt).length} von ${haken.length} Haken`;

export function kommentarText(e: Entscheidung, belege: Beleg[], runde: number, pr: string): string {
  const zeilen = belege.filter((b) => b.belegt && e.belegt.includes(b.text)).map((b) => `- [x] ${b.text} (${b.beleg})`);
  return [
    e.status === "wartet" ? "<!-- abnahme-wartet:nachweis -->" : RUNDE_MARKER,
    `${e.status === "wartet" ? "In Review" : `Runde ${runde} von ${MAX_RUNDEN}`}, ${pr}: ${e.status === "done" ? "alle Fertig-Kriterien belegt, Done." : `${e.grund}.`}`,
    ...zeilen,
    ...(e.offen.length ? ["", "Offen:", ...e.offen.map((o) => `- [ ] ${o}`)] : []),
    ...belege.filter((b) => !b.belegt && b.beleg.trim()).map((b) => `Nächster Nachweis für „${b.text}“: ${b.beleg}`),
    ...(e.status === "needs-human" ? ["", `Nach ${MAX_RUNDEN} Runden noch nicht fertig: Label needs-human, Sinan entscheidet.`] : []),
  ].join("\n");
}

/** Hinweis für den Worker bei Wiederaufnahme: schon belegte Haken gibt es, offene bleiben. */
export function wiederaufnahme(beschreibung: string | null | undefined): string {
  const haken = leseHaken(beschreibung);
  const offen = haken.filter((h) => !h.erledigt);
  if (!offen.length || offen.length === haken.length) return "";
  return `Wiederaufnahme (SIN-754): ${zaehler(haken)} belegt. Nur noch offen: ${offen.map((h) => h.text).join("; ")}`;
}

/** Haken-Belege des Prüfers stehen base64-kodiert als Marker im Prüfer-Kommentar. */
export const hakenMarker = (belege: Beleg[], stand?: PruefStand) => `<!-- pruefer-haken:${Buffer.from(JSON.stringify(stand ? { ...stand, belege } : belege)).toString("base64")} -->`;

/** Jüngster Prüfer-Kommentar mit Haken; ein kaputter Marker zählt als „nichts belegt“. */
export function leseBelege(kommentare: string[], stand?: PruefStand): Beleg[] | null {
  for (const k of [...kommentare].reverse()) {
    const m = HAKEN_MARKER.exec(k);
    if (!m) continue;
    try {
      const roh = JSON.parse(Buffer.from(m[1], "base64").toString("utf8"));
      if (stand && (roh?.head !== stand.head || roh?.auftrag !== stand.auftrag)) return null;
      const j = stand ? roh.belege : roh;
      if (stand && (!Array.isArray(j) || !j.every((b) => typeof b?.text === "string" && typeof b?.belegt === "boolean" && typeof b?.beleg === "string" && ["code", "live", "entscheidung"].includes(b?.art)))) return null;
      return Array.isArray(j) ? j.filter((b): b is Beleg => typeof b?.text === "string" && typeof b?.belegt === "boolean").map((b) => ({ text: b.text, belegt: b.belegt, beleg: String(b.beleg ?? ""), ...(["code", "live", "entscheidung"].includes(b.art ?? "") ? { art: b.art } : {}) })) : null;
    } catch {
      return null;
    }
  }
  return null;
}
