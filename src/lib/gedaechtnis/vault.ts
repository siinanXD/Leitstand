// Vault-Struktur nach LLM-Wiki-Muster (SIN-615): index.md, log.md, Regeldatei, Bases-Ansichten und Wochen-Check.
// Rein, kein Netz. `scripts/gedaechtnis/schreiben.ts` liest den geklonten Vault ein und schreibt das Ergebnis zurück.
import { tagBerlin, type Dateien } from "./gedaechtnis";

export const PFLICHT = ["typ", "produkt", "status", "datum", "quelle", "beschreibung"] as const;
/** Ohne Eigenschaften und ohne Verlinkungspflicht: Regeldatei, Katalog, Protokoll. */
const OHNE_PRUEFUNG = new Set(["CLAUDE.md", "index.md", "log.md"]);
/** Tagesberichte und die Übersicht werden nicht verlinkt, sondern erzeugt. */
const OHNE_VERLINKUNG = new Set(["tag", "uebersicht"]);
const IDEE_ALT_TAGE = 30;

export type Befund = { art: "eigenschaft" | "link" | "unverlinkt" | "widerspruch" | "idee-alt"; pfad: string; text: string };

/** Frontmatter als Schlüssel → Wert; ohne Frontmatter leer. */
export function eigenschaften(text: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---(\n|$)/.exec(text);
  if (!m) return {};
  return Object.fromEntries(
    m[1].split("\n").flatMap((z) => {
      const k = /^([A-Za-z]+):\s*(.*)$/.exec(z);
      return k ? [[k[1], k[2].trim()] as [string, string]] : [];
    }),
  );
}

const ohneEndung = (pfad: string): string => pfad.replace(/\.md$/, "");
const notizen = (d: Dateien): string[] => Object.keys(d).filter((p) => p.endsWith(".md")).sort();

/** Ziele aller `[[…]]`-Links im Text (ohne Alias und Überschrift). */
export const linkZiele = (text: string): string[] => [...text.matchAll(/\[\[([^\]|#]+)[^\]]*\]\]/g)].map((m) => m[1].trim());

/** Obsidian löst `[[Name]]` auch über den Dateinamen auf. */
function aufloesen(ziel: string, d: Dateien): string | null {
  const voll = `${ziel}.md`;
  if (voll in d) return voll;
  const treffer = notizen(d).filter((p) => p.split("/").pop() === voll);
  return treffer.length === 1 ? treffer[0] : null;
}

/** Prüft alle Notizen: fehlende Eigenschaften, kaputte Links, Notizen ohne eingehenden Link, widersprüchliche Entscheidungen, alte Ideen. */
export function pruefe(d: Dateien, jetzt: Date): Befund[] {
  const befunde: Befund[] = [];
  const eingehend = new Set<string>();
  const eigen = new Map(notizen(d).map((p) => [p, eigenschaften(d[p])]));
  for (const p of notizen(d)) {
    for (const ziel of linkZiele(d[p])) {
      const da = aufloesen(ziel, d);
      if (!da) befunde.push({ art: "link", pfad: p, text: `Link [[${ziel}]] führt ins Leere` });
      else if (da !== p && !OHNE_PRUEFUNG.has(p)) eingehend.add(da);
    }
  }
  for (const [p, e] of eigen) {
    if (OHNE_PRUEFUNG.has(p)) continue;
    const fehlt = PFLICHT.filter((k) => !e[k]);
    if (fehlt.length) befunde.push({ art: "eigenschaft", pfad: p, text: `fehlt: ${fehlt.join(", ")}` });
    else if (!OHNE_VERLINKUNG.has(e.typ) && !eingehend.has(p)) befunde.push({ art: "unverlinkt", pfad: p, text: "kein Link führt hierher" });
  }
  // shortcut: Widerspruch nur, wenn eine geltende Entscheidung „Ersetzt: [[X]]“ sagt und X selbst noch gilt; inhaltliche Widersprüche erkennt erst ein KI-Lauf.
  for (const [p, e] of eigen) {
    if (e.typ !== "entscheidung" || e.status !== "gilt") continue;
    for (const [, ziel] of d[p].matchAll(/^Ersetzt:\s*\[\[([^\]|#]+)/gim)) {
      const x = aufloesen(ziel.trim(), d);
      if (x && eigen.get(x)?.status === "gilt") befunde.push({ art: "widerspruch", pfad: p, text: `ersetzt [[${ohneEndung(x)}]], beide stehen auf gilt` });
    }
  }
  const grenze = jetzt.getTime() - IDEE_ALT_TAGE * 86_400_000;
  for (const [p, e] of eigen) if (e.typ === "idee" && e.status === "neu" && Date.parse(e.datum) < grenze) befunde.push({ art: "idee-alt", pfad: p, text: `neu seit ${e.datum}, älter als ${IDEE_ALT_TAGE} Tage` });
  return befunde;
}

/** Abschnitt für Tagesbericht und Protokoll. */
export function wochenBericht(befunde: Befund[]): string[] {
  return ["## Wochen-Check", ...(befunde.length === 0 ? ["Keine Befunde."] : befunde.map((b) => `- ${b.art}: [[${ohneEndung(b.pfad)}]] ${b.text}`))];
}

export const istSonntag = (jetzt: Date): boolean => new Date(`${tagBerlin(jetzt)}T12:00:00Z`).getUTCDay() === 0;

/** Katalog: je Seite eine Zeile mit der `beschreibung`, nach Ordner gruppiert. */
export function indexSeite(d: Dateien): string {
  const zeilen: string[] = [];
  let ordner = "";
  for (const p of notizen(d).filter((x) => x !== "index.md" && x !== "log.md")) {
    const o = p.includes("/") ? p.split("/")[0] : "Wurzel";
    if (o !== ordner) zeilen.push("", `## ${o}`);
    ordner = o;
    zeilen.push(`- [[${ohneEndung(p)}]] · ${eigenschaften(d[p]).beschreibung || "ohne Beschreibung"}`);
  }
  return ["# Index", "", "Katalog aller Seiten. Zuerst hier lesen, dann gezielt einzelne Seiten. Pflegt der Agent bei jedem Lauf.", ...zeilen, ""].join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** Hängt eine Zeile an das Protokoll; dieselbe Zeile steht nicht zweimal hintereinander (jeder Lauf soll nur bei Änderung etwas schreiben). */
export function logAnhaengen(alt: string | undefined, jetzt: Date, text: string): string {
  const basis = alt?.trimEnd() || "# Protokoll\n\nNur anhängen. Format: Datum · Agent · was.";
  const zeile = `- ${tagBerlin(jetzt)} · gedaechtnis-agent · ${text}`;
  return basis.split("\n").at(-1) === zeile ? `${basis}\n` : `${basis}\n${zeile}\n`;
}

export const REGELN = `# Regeln für Agenten

Dieser Vault ist das Gedächtnis für das Programmieren. Geschrieben wird nur von Agenten per Git, keine Obsidian-App nötig.

## Lesen

1. Zuerst [[index]], dann gezielt einzelne Seiten. Stand in 2 Minuten: [[00 Wo stehen wir]].
2. [[log]] zeigt, was zuletzt geändert wurde.

## Ordner

- \`Produkte/\` je Produkt eine Seite
- \`Entscheidungen/\` eine Notiz je Entscheidung, \`status: gilt\` oder \`ersetzt\` (die neue Notiz trägt die Zeile \`Ersetzt:\` mit Wiki-Link auf die alte)
- \`Ideen/\` \`status: neu\`, \`geplant\` oder \`verworfen\`
- \`Gespräche/\` aus dem Linear-Eingang (Label \`gedaechtnis\`)
- \`Lehren/\` Muster und Stolperfallen aus LEHREN.md
- \`Tage/\` Tagesbericht, sonntags mit Abschnitt „Wochen-Check“
- \`Ansichten/\` Obsidian Bases (\`.base\`)

## Eigenschaften (jede Notiz außer dieser Datei, index und log)

${PFLICHT.map((k) => `\`${k}\``).join(", ")}. \`beschreibung\` ist eine Zeile und steht im Index.

## Wer schreibt was

Der Gedächtnis-Agent (Leitstand, \`scripts/gedaechtnis/schreiben.ts\`) schreibt Übersicht, Produkte, Tage, Entscheidungen, Gespräche, index und log. Links nach Bedeutung: Wiki-Links zwischen Produkt, Entscheidung, Idee und Tag.

## Verboten

Keine Geheimnisse, keine Personendaten, keine Rohdaten. Ein Treffer der Geheimnis-Prüfung stoppt das Schreiben.
`;

/** Eine Ansicht: Tabelle über alle Notizen mit passendem Filter. Läuft ohne Plugin (Bases ist Obsidian-Core). */
const ansicht = (filter: string, name: string, spalten: string[]): string => `filters:\n  and:\n    - '${filter}'\nviews:\n  - type: table\n    name: ${name}\n    order:\n${spalten.map((s) => `      - ${s}`).join("\n")}\n`;

export const ANSICHTEN: Dateien = {
  "Ansichten/Offene Entscheidungen.base": ansicht('typ == "entscheidung" && status == "gilt"', "Offene Entscheidungen", ["file.name", "produkt", "datum", "beschreibung"]),
  "Ansichten/Ideen nach Produkt.base": ansicht('typ == "idee"', "Ideen nach Produkt", ["produkt", "file.name", "status", "datum", "beschreibung"]),
  "Ansichten/Lehren.base": ansicht('typ == "lehre"', "Lehren", ["file.name", "produkt", "datum", "beschreibung"]),
};

/**
 * Ergänzt die erzeugten Notizen um Regeldatei, Ansichten, Index und Protokoll und hängt sonntags (oder mit `erzwingen`) den Wochen-Check an Tagesbericht und Protokoll.
 * `vorhanden` ist der Stand des Vaults vor dem Schreiben, `neu` das, was dieser Lauf erzeugt.
 */
export function abschliessen(vorhanden: Dateien, neu: Dateien, jetzt: Date, erzwingen = false): { dateien: Dateien; befunde: Befund[] | null } {
  const dateien: Dateien = { ...neu, "CLAUDE.md": REGELN, ...ANSICHTEN };
  const alle: Dateien = { ...vorhanden, ...dateien };
  const woche = erzwingen || istSonntag(jetzt);
  const befunde = woche ? pruefe(alle, jetzt) : null;
  const tag = `Tage/${tagBerlin(jetzt)}.md`;
  if (befunde && tag in alle) {
    dateien[tag] = `${alle[tag].trimEnd()}\n\n${wochenBericht(befunde).join("\n")}\n`;
    alle[tag] = dateien[tag];
  }
  const text = `${notizen(alle).length} Notizen${befunde ? `, Wochen-Check: ${befunde.length} Befunde` : ""}`;
  dateien["log.md"] = logAnhaengen(vorhanden["log.md"], jetzt, text);
  alle["log.md"] = dateien["log.md"];
  dateien["index.md"] = indexSeite(alle);
  return { dateien, befunde };
}
