/**
 * Lern-Agent (SIN-512): reine Funktionen. Aus Ereignissen und Fehlerhinweisen entstehen ein fester JSON-Bericht,
 * Lehren (eine Datei je Thema, kein Merge-Konflikt) und Hinweise für den Worker-Prompt. Kein Netz, kein Dateizugriff.
 */

export const LEHREN_ORDNER = "docs/autonomy/lehren";
export const MIN_FEHLER = 2;
export const MIN_ABLAUF = 3;
export const MAX_HINWEIS_ZEILEN = 15;

const ROT = /fail|fehler|error|abort|crash|red|rot|stuck|timeout|needs-human/i;

export type LernEreignis = {
  created_at: string;
  step: string | null;
  status: string | null;
  issue: string | null;
  pr: number | null;
  agent: string | null;
  /** US-Dollar, wie in loop_events. */
  cost: number | null;
  /** Optional: Labels des Issues (Aufgabentyp) und Größe, z. B. `size:s`. */
  labels?: string[];
};

/** Freitext-Fehlerhinweis: Repair-Kommentar, Abbruchgrund oder Zeile aus dem Laufprotokoll. */
export type Fehlerhinweis = { thema: string; text: string; quelle: string };

export type FehlerGruppe = { thema: string; anzahl: number; text: string; quellen: string[] };
export type KostenZeile = { typ: string; laeufe: number; durchschnittUsd: number };
export type Bericht = {
  schema: "lernen-bericht/1";
  erstellt: string;
  zeitraumStunden: number;
  ereignisse: number;
  fehler: FehlerGruppe[];
  kosten: KostenZeile[];
  skillVorschlaege: { name: string; anzahl: number }[];
  vorschlaege: string[];
};

export type Lehre = { datei: string; titel: string; gilt: string[]; text: string };

/** Dateiname aus einem Thema: klein, ASCII, Bindestriche. */
export function slug(thema: string): string {
  return (
    thema
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "thema"
  );
}

/** Fehlerhinweise aus roten Ereignissen: Thema = Schritt + Status. */
export function hinweiseAusEreignissen(events: LernEreignis[]): Fehlerhinweis[] {
  return events
    .filter((e) => e.status && ROT.test(e.status))
    .map((e) => ({
      thema: `${e.step ?? "unbekannt"} ${e.status}`,
      text: `Schritt ${e.step ?? "?"} endete mit „${e.status}“.`,
      quelle: [e.issue, e.pr ? `#${e.pr}` : null].filter(Boolean).join(" ") || e.created_at,
    }));
}

/** Wiederkehrende Fehler: gleiches Thema mindestens MIN_FEHLER-mal. */
export function wiederkehrend(hinweise: Fehlerhinweis[]): FehlerGruppe[] {
  const map = new Map<string, FehlerGruppe>();
  for (const h of hinweise) {
    const k = slug(h.thema);
    const g = map.get(k) ?? { thema: h.thema, anzahl: 0, text: h.text, quellen: [] };
    g.anzahl += 1;
    if (!g.quellen.includes(h.quelle)) g.quellen.push(h.quelle);
    map.set(k, g);
  }
  return [...map.values()].filter((g) => g.anzahl >= MIN_FEHLER).sort((a, b) => b.anzahl - a.anzahl || a.thema.localeCompare(b.thema));
}

/** Aufgabentyp aus Labels: erstes `size:*`-Label, sonst erstes Label außer `claude`, sonst „ohne“. */
export function aufgabenTyp(labels: string[] | undefined): string {
  const l = (labels ?? []).filter((x) => x.toLowerCase() !== "claude");
  return l.find((x) => /^size:/i.test(x)) ?? l[0] ?? "ohne";
}

/** Ø Kosten je Aufgabentyp, nur aus Ereignissen mit echten Kosten. */
export function kostenJeTyp(events: LernEreignis[]): KostenZeile[] {
  const map = new Map<string, { summe: number; issues: Set<string> }>();
  for (const e of events) {
    if (e.cost == null || !e.issue) continue;
    const typ = aufgabenTyp(e.labels);
    const z = map.get(typ) ?? { summe: 0, issues: new Set<string>() };
    z.summe += e.cost;
    z.issues.add(e.issue);
    map.set(typ, z);
  }
  return [...map.entries()]
    .map(([typ, z]) => ({ typ, laeufe: z.issues.size, durchschnittUsd: Math.round((z.summe / z.issues.size) * 1000) / 1000 }))
    .sort((a, b) => a.typ.localeCompare(b.typ));
}

/** Abläufe, die sich mindestens MIN_ABLAUF-mal wiederholen, als Skill-Vorschlag (Schrittfolge je Issue). */
export function skillVorschlaege(events: LernEreignis[]): { name: string; anzahl: number }[] {
  const jeIssue = new Map<string, LernEreignis[]>();
  for (const e of events) if (e.issue && e.step) jeIssue.set(e.issue, [...(jeIssue.get(e.issue) ?? []), e]);
  const folgen = new Map<string, number>();
  for (const liste of jeIssue.values()) {
    const folge = [...liste]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((e) => e.step!.toLowerCase())
      .filter((s, i, a) => a[i - 1] !== s);
    if (folge.length < 2) continue;
    const k = folge.join(" > ");
    folgen.set(k, (folgen.get(k) ?? 0) + 1);
  }
  return [...folgen.entries()]
    .filter(([, n]) => n >= MIN_ABLAUF)
    .map(([name, anzahl]) => ({ name: slug(name), anzahl }))
    .sort((a, b) => b.anzahl - a.anzahl);
}

export function erstelleBericht(events: LernEreignis[], hinweise: Fehlerhinweis[], jetzt: Date, stunden = 24): Bericht {
  const ab = jetzt.getTime() - stunden * 3600_000;
  const ev = events.filter((e) => Date.parse(e.created_at) >= ab);
  const fehler = wiederkehrend([...hinweiseAusEreignissen(ev), ...hinweise]);
  const skills = skillVorschlaege(ev);
  const vorschlaege = [
    ...fehler.map((f) => `Lehre „${f.thema}“ anlegen (${f.anzahl}×).`),
    ...skills.map((s) => `Skill „${s.name}“ anlegen (${s.anzahl}× derselbe Ablauf).`),
  ];
  return { schema: "lernen-bericht/1", erstellt: jetzt.toISOString(), zeitraumStunden: stunden, ereignisse: ev.length, fehler, kosten: kostenJeTyp(ev), skillVorschlaege: skills, vorschlaege };
}

/** Eine Lehre als Markdown-Datei. `gilt` = Labels, Bereiche oder Dateipfade, für die sie zählt. */
export function lehreDatei(g: FehlerGruppe, gilt: string[]): { pfad: string; inhalt: string } {
  const inhalt = [`# ${g.thema}`, `Gilt für: ${gilt.join(", ") || "alle"}`, "", `${g.text} Aufgetreten ${g.anzahl}× (${g.quellen.slice(0, 5).join(", ")}).`, ""].join("\n");
  return { pfad: `${LEHREN_ORDNER}/${slug(g.thema)}.md`, inhalt };
}

export function leseLehre(datei: string, inhalt: string): Lehre {
  const zeilen = inhalt.split("\n");
  const titel = (zeilen.find((z) => z.startsWith("# ")) ?? `# ${datei}`).slice(2).trim();
  const giltZeile = zeilen.find((z) => z.startsWith("Gilt für:"));
  const gilt = (giltZeile ? giltZeile.slice("Gilt für:".length) : "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => s && s !== "alle");
  const text = zeilen.filter((z) => z.trim() && !z.startsWith("# ") && !z.startsWith("Gilt für:")).join(" ");
  return { datei, titel, gilt, text };
}

/** Index über alle Lehren (wird erzeugt, nie von Hand gepflegt). */
export function lehrenIndex(lehren: Lehre[]): string {
  const zeilen = [...lehren].sort((a, b) => a.datei.localeCompare(b.datei)).map((l) => `- [${l.titel}](${l.datei}): ${l.gilt.join(", ") || "alle"}`);
  return ["# Lehren", "", "Erzeugt vom Lern-Agent (SIN-512). Nicht von Hand ändern; eine Datei je Thema in diesem Ordner.", "", ...zeilen, ""].join("\n");
}

export type IssueKontext = { labels: string[]; bereich?: string | null; dateien?: string[] };

/** Lehren, die zu Labels, Bereich oder Dateien des Issues passen (ohne Eintrag unter „Gilt für“ = passt immer). */
export function passendeLehren(lehren: Lehre[], k: IssueKontext): Lehre[] {
  const schluessel = [...k.labels, k.bereich ?? "", ...(k.dateien ?? [])].map((s) => s.toLowerCase()).filter(Boolean);
  return lehren.filter((l) => l.gilt.length === 0 || l.gilt.some((g) => schluessel.some((s) => s === g || s.startsWith(g))));
}

/** Kosten-Richtwert für den Aufgabentyp. */
export function kostenRichtwert(kosten: KostenZeile[], labels: string[]): string | null {
  const z = kosten.find((x) => x.typ === aufgabenTyp(labels));
  return z ? `Ähnliche Aufgaben (${z.typ}): Ø ${z.durchschnittUsd.toFixed(2)} $ je Lauf, ${z.laeufe} Läufe.` : null;
}

/** Abschnitt für den Worker-Prompt: höchstens MAX_HINWEIS_ZEILEN Zeilen, leer wenn nichts passt. Der Richtwert bleibt, Lehren werden zuerst gekürzt. */
export function workerHinweise(lehren: Lehre[], skills: string[], richtwert: string | null, k: IssueKontext): string {
  const eintraege = [...passendeLehren(lehren, k).map((l) => `- ${l.titel}: ${l.text}`), ...skills.map((s) => `- Skill: docs/skills/${s}/SKILL.md`)];
  if (!eintraege.length && !richtwert) return "";
  const platz = MAX_HINWEIS_ZEILEN - 1 - (richtwert ? 1 : 0);
  return ["Gelernt aus früheren Läufen:", ...eintraege.slice(0, platz), ...(richtwert ? [richtwert] : [])].join("\n");
}
