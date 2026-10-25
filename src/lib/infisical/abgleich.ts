// Infisical pflegt sich selbst (SIN-1051). Rein: Soll-Liste (docs/autonomy/produkte.json) gegen Ist, Pflegeplan, Erinnerungen.
// Werte kommen hier nie vor: `Ist` kennt nur Namen und die Angabe „leer“; Netz in scripts/infisical/pflegen.ts.
import type { Produkt } from "../kontingent/produkte";

export type Ist = {
  /** Vorhandene Ordner je Umgebung. */
  ordner: { environment: string; pfad: string }[];
  /** Vorhandene Variablen: Name und ob der Wert leer ist, nie der Wert selbst. */
  variablen: { environment: string; pfad: string; name: string; leer: boolean }[];
};

export type Befund =
  | { art: "fehlender_ordner"; produkt: string; environment: string; pfad: string }
  | { art: "fehlende_variable"; produkt: string; environment: string; pfad: string; name: string }
  | { art: "leerer_wert"; produkt: string; environment: string; pfad: string; name: string }
  | { art: "unbekannt_in_infisical"; produkt: string; environment: string; pfad: string; name: string };

/** Pflege legt nur an; es gibt bewusst keine Aktion zum Ändern oder Löschen. */
export type Aktion =
  | { art: "ordner_anlegen"; environment: string; pfad: string }
  | { art: "variable_anlegen"; environment: string; pfad: string; name: string };

const schluessel = (environment: string, pfad: string, name = "") => `${environment}\u0000${pfad}\u0000${name}`;

/** Die vier Befundarten. Fehlt ein Ordner, fehlen auch seine Variablen (die Pflege legt beides an); unbekannte Variablen werden nur gemeldet. */
export function gleicheAb(produkte: Produkt[], ist: Ist): Befund[] {
  const ordner = new Set(ist.ordner.map((o) => schluessel(o.environment, o.pfad)));
  const variablen = new Map(ist.variablen.map((v) => [schluessel(v.environment, v.pfad, v.name), v.leer]));
  const befunde: Befund[] = [];
  for (const p of produkte) {
    const pfad = p.infisicalOrdner;
    const umgebungen = [...new Set(p.secrets.map((s) => s.environment))];
    for (const environment of umgebungen) {
      if (!ordner.has(schluessel(environment, pfad))) befunde.push({ art: "fehlender_ordner", produkt: p.id, environment, pfad });
    }
    const soll = new Set(p.secrets.map((s) => schluessel(s.environment, pfad, s.name)));
    for (const s of p.secrets) {
      const leer = variablen.get(schluessel(s.environment, pfad, s.name));
      if (leer === undefined) befunde.push({ art: "fehlende_variable", produkt: p.id, environment: s.environment, pfad, name: s.name });
      else if (leer) befunde.push({ art: "leerer_wert", produkt: p.id, environment: s.environment, pfad, name: s.name });
    }
    for (const v of ist.variablen) {
      if (v.pfad === pfad && umgebungen.includes(v.environment) && !soll.has(schluessel(v.environment, pfad, v.name)))
        befunde.push({ art: "unbekannt_in_infisical", produkt: p.id, environment: v.environment, pfad, name: v.name });
    }
  }
  return befunde;
}

/** Aus den Befunden die Anlege-Aktionen, Ordner zuerst. Alles andere (leere Werte, Unbekanntes) bleibt unberührt. */
export function plane(befunde: Befund[]): Aktion[] {
  const ordner = befunde.flatMap((b): Aktion[] => (b.art === "fehlender_ordner" ? [{ art: "ordner_anlegen", environment: b.environment, pfad: b.pfad }] : []));
  const variablen = befunde.flatMap((b): Aktion[] => (b.art === "fehlende_variable" ? [{ art: "variable_anlegen", environment: b.environment, pfad: b.pfad, name: b.name }] : []));
  return [...ordner, ...variablen];
}

export type Erinnerung = { titel: string; beschreibung: string };

/** Titel einer Erinnerung; daran erkennt `abgeschlossene` die eigenen Linear-Aufgaben wieder. */
const TITEL = /^.+: Wert für `[A-Z][A-Z0-9_]*` in Infisical eintragen$/;

/** Je leerem Wert eine `sinan`-Aufgabe („Braucht dich“) mit Link auf den Ordner und der Anleitung aus der Soll-Liste. */
export function erinnerungen(befunde: Befund[], produkte: Produkt[], infisicalUrl: string): Erinnerung[] {
  const titel = new Set<string>();
  return befunde.flatMap((b) => {
    if (b.art !== "leerer_wert") return [];
    const s = produkte.find((p) => p.id === b.produkt)?.secrets.find((x) => x.name === b.name && x.environment === b.environment);
    const anzeige = b.produkt.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
    const t = `${anzeige}: Wert für \`${b.name}\` in Infisical eintragen`;
    if (titel.has(t)) return [];
    titel.add(t);
    const link = `${infisicalUrl}?secretPath=${encodeURIComponent(b.pfad)}&env=${encodeURIComponent(b.environment)}`;
    return [{ titel: t, beschreibung: `${s?.zweck ?? b.name}.\n\n1. Wert holen: ${s?.wo_holen ?? "siehe docs/autonomy/produkte.json"}.\n2. In Infisical eintragen: ${link} (Umgebung ${b.environment}, Ordner ${b.pfad}).\n\nca. 5 Minuten. Die Aufgabe schließt sich selbst, sobald der Wert nicht mehr leer ist.` }];
  });
}

/** Offene Erinnerungen (Titel), deren Wert inzwischen gefüllt ist: Titel passt zum Muster, steht aber nicht mehr in der Soll-Erinnerung. */
export const abgeschlossene = (offeneTitel: string[], aktuell: Erinnerung[]): string[] => {
  const noch = new Set(aktuell.map((e) => e.titel));
  return offeneTitel.filter((t) => TITEL.test(t) && !noch.has(t));
};
