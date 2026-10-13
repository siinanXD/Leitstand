// Gedächtnis-Agent (SIN-541): reine Markdown-Erzeugung für den Obsidian-Vault `siinanXD/gedaechtnis`. Kein Netz, kein Dateizugriff.
// `scripts/gedaechtnis/schreiben.ts` sammelt die Daten und pusht. Nur Zusammenfassungen, keine Rohdaten, Traces oder Geheimnisse.

export const VAULT_REPO = "siinanXD/gedaechtnis";
export const VAULT_URL = `https://github.com/${VAULT_REPO}`;
/** Schritt in `loop_events`; die Kachel „Gedächtnis“ liest daran das Datum der letzten Aktualisierung. */
export const SCHRITT = "gedaechtnis";
const QUELLE = "scripts/gedaechtnis/schreiben.ts";

/** Grenzen: „Wo stehen wir“ liest sich auf dem Handy ohne Scrollen, ein Tag hat höchstens 30 Zeilen. */
export const MAX_ZEILEN_UEBERSICHT = 25;
export const MAX_ZEILEN_TAG = 30;
const MAX_ENTSCHEIDUNGEN = 10;
const MAX_ZEICHEN = 90;

export type Produkt = { id: string; name: string; ziel: string; fertig: number | null; gesamt: number | null; laeuft: string[]; sinan: string[] };
export type Pr = { nummer: number; titel: string; projekt: string; url: string };
/** `id` ist die Linear-Kennung aus dem Dateinamen in `docs/decisions/`, `url` der Link auf die Datei (kein Inhalt wird kopiert). */
export type Entscheidung = { id: string; projekt: string; titel: string; url: string };
export type OffenerPunkt = { titel: string; projekt: string; url: string | null; art: "sinan" | "freigabe" };
export type Eingabe = { jetzt: Date; produkte: Produkt[]; prs: Pr[]; entscheidungen: Entscheidung[]; offen: OffenerPunkt[]; kostenUsd: number | null; probleme: string[] };

export type Dateien = Record<string, string>;

/** Kalendertag (JJJJ-MM-TT) in Berliner Zeit. */
export const tagBerlin = (d: Date): string => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

/** Einzeilig, gekürzt, ohne Zeichen, die Obsidian-Links oder Frontmatter brechen. */
const kurz = (text: string, max = MAX_ZEICHEN): string => {
  const t = text.replace(/\s+/g, " ").replace(/[[\]|]/g, "").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** Dateiname-tauglich: keine Pfad- und Obsidian-Sonderzeichen. */
const dateiname = (text: string): string => text.replace(/[\\/:*?"<>|#^[\]]+/g, "-").trim() || "ohne-name";

const slug = (id: string): string => id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const kopf = (typ: string, produkt: string, datum: string): string[] => ["---", `typ: ${typ}`, `produkt: ${produkt}`, `datum: ${datum}`, `quelle: ${QUELLE}`, "---"];

/** Beim Liste kürzen: Rest als eine Zeile, damit die Zeilengrenze hält. */
function begrenze(zeilen: string[], max: number): string[] {
  return zeilen.length <= max ? zeilen : [...zeilen.slice(0, max - 1), `… und ${zeilen.length - max + 1} weitere`];
}

const stand = (p: Produkt): string => (p.fertig !== null && p.gesamt !== null ? `${p.fertig}/${p.gesamt} fertig` : "Stand unbekannt");
const auflistung = (liste: string[], leer: string): string => (liste.length === 0 ? leer : liste.slice(0, 2).map((t) => kurz(t, 40)).join("; ") + (liste.length > 2 ? ` (+${liste.length - 2})` : ""));

/** Immer oben: je Produkt genau 3 Zeilen (Stand, was läuft, was Sinan tun muss). Wird jedes Mal komplett neu geschrieben. */
export function uebersicht(e: Eingabe): string {
  const maxProdukte = Math.floor((MAX_ZEILEN_UEBERSICHT - 8) / 3);
  const sichtbar = e.produkte.slice(0, maxProdukte);
  const zeilen = [...kopf("uebersicht", "alle", tagBerlin(e.jetzt)), "# Wo stehen wir", ""];
  for (const p of sichtbar) {
    zeilen.push(
      `**[[Produkte/${dateiname(p.name)}|${kurz(p.name, 30)}]]** · ${stand(p)} #produkt/${slug(p.id)}`,
      `Läuft: ${auflistung(p.laeuft, "nichts")}`,
      `Du: ${auflistung(p.sinan, "nichts zu tun")}`,
    );
  }
  const mehr = e.produkte.length - sichtbar.length;
  zeilen.push(`[[Offen]] · ${e.offen.length} offen${mehr > 0 ? ` · ${mehr} Produkte nur unter Produkte/` : ""}`);
  return zeilen.join("\n") + "\n";
}

export function produktSeite(p: Produkt, entscheidungen: Entscheidung[], jetzt: Date): string {
  const meine = entscheidungen.filter((x) => x.projekt === p.id).slice(0, MAX_ENTSCHEIDUNGEN);
  return [
    ...kopf("produkt", p.id, tagBerlin(jetzt)),
    `# ${kurz(p.name, 40)} #produkt/${slug(p.id)}`,
    "",
    `**Ziel:** ${p.ziel ? kurz(p.ziel, 200) : "nicht hinterlegt"}`,
    `**Fortschritt:** ${stand(p)}`,
    "",
    "## Letzte Entscheidungen",
    ...(meine.length === 0 ? ["Keine."] : meine.map((x) => `- [[Entscheidungen/${dateiname(x.id)}]] ${kurz(x.titel)}`)),
    "",
    "Zurück: [[00 Wo stehen wir]]",
  ].join("\n") + "\n";
}

/** Ein Tag: gebaut, entschieden, Kosten, Probleme. Höchstens 30 Zeilen. */
export function tagSeite(e: Eingabe): string {
  const tag = tagBerlin(e.jetzt);
  const ids = e.entscheidungen.filter((x) => e.prs.some((p) => p.titel.includes(x.id)));
  const feste = 6 + 2 + 3 * 2 + 2 + 1; // Kopf, Titel, Abschnittszeilen, Leerzeilen, Fuß: übrig für Listen
  const platz = MAX_ZEILEN_TAG - feste;
  const je = Math.max(1, Math.floor(platz / 3));
  const kosten = e.kostenUsd === null ? "Kosten: unbekannt" : `Kosten: ${e.kostenUsd.toFixed(2)} US-Dollar (Agenten, ohne Abos)`;
  const gebaut = e.prs.length === 0 ? ["Nichts gemergt."] : e.prs.map((p) => `- #${p.nummer} ${kurz(p.titel)}`);
  const entschieden = ids.length === 0 ? ["Nichts."] : ids.map((x) => `- [[Entscheidungen/${dateiname(x.id)}]] ${kurz(x.titel)}`);
  const probleme = e.probleme.length === 0 ? ["Keine."] : e.probleme.map((t) => `- ${kurz(t)}`);
  return [
    ...kopf("tag", "alle", tag),
    `# ${tag}`,
    "## Gebaut",
    ...begrenze(gebaut, je),
    "## Entschieden",
    ...begrenze(entschieden, je),
    "## Kosten und Probleme",
    kosten,
    ...begrenze(probleme, je),
    "",
    "[[00 Wo stehen wir]]",
  ].join("\n") + "\n";
}

export function entscheidungSeite(x: Entscheidung, jetzt: Date): string {
  return [...kopf("entscheidung", x.projekt, tagBerlin(jetzt)), `# ${x.id}: ${kurz(x.titel)}`, "", `Entscheidungsdatei: ${x.url}`, "", `[[Produkte/${dateiname(x.projekt)}]]`].join("\n") + "\n";
}

export function offenSeite(e: Eingabe): string {
  const zeile = (o: OffenerPunkt) => `- ${o.art === "freigabe" ? "Freigabe" : "Aufgabe"} (${kurz(o.projekt, 30)}): ${o.url ? `[${kurz(o.titel)}](${o.url})` : kurz(o.titel)}`;
  return [...kopf("offen", "alle", tagBerlin(e.jetzt)), "# Offen", "", ...(e.offen.length === 0 ? ["Nichts offen."] : e.offen.map(zeile)), "", "[[00 Wo stehen wir]]"].join("\n") + "\n";
}

/** Alle Dateien des Vaults: Pfad → Inhalt. */
export function dateien(e: Eingabe): Dateien {
  const out: Dateien = { "00 Wo stehen wir.md": uebersicht(e), "Offen.md": offenSeite(e), [`Tage/${tagBerlin(e.jetzt)}.md`]: tagSeite(e) };
  for (const p of e.produkte) out[`Produkte/${dateiname(p.name)}.md`] = produktSeite(p, e.entscheidungen, e.jetzt);
  for (const x of e.entscheidungen) out[`Entscheidungen/${dateiname(x.id)}.md`] = entscheidungSeite(x, e.jetzt);
  return out;
}

const GEHEIMNIS = /(ghp_|gho_|github_pat_|sk-[a-z0-9]|eyJ[a-z0-9_-]{10,}|service_role|bearer\s+[a-z0-9._-]{12,}|-----BEGIN|api[_-]?key\s*[:=])/i;

/** Pfade, deren Inhalt nach Geheimnis aussieht. Ein Treffer bricht das Schreiben ab. */
export const mitGeheimnis = (d: Dateien): string[] => Object.entries(d).filter(([, text]) => GEHEIMNIS.test(text)).map(([pfad]) => pfad);

/** Zeile für `loop_events`, gelesen von der Kachel „Gedächtnis“. */
export const ereignisZeile = (runId: string | null, runUrl: string | null) => ({ project: "leitstand", agent: "betrieb", step: SCHRITT, status: "ok", issue: null, pr: null, run_id: runId, run_url: runUrl });

/** Kachel-Text: „zuletzt aktualisiert“ aus dem Zeitstempel des letzten Ereignisses. */
export function aktualisiertSatz(iso: string | null): string {
  const t = iso ? new Date(iso) : null;
  if (!t || Number.isNaN(t.getTime())) return "Noch nicht geschrieben";
  return `Zuletzt aktualisiert am ${t.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })} um ${t.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })} Uhr`;
}
