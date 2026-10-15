// Wochen-Check für Sinan (SIN-631). Rein, kein Netz: Checkliste, Push-Zeitpunkt, Prüfung der Eingabe und die Notiz fürs Gedächtnis.
import { berlinZeit, inRuhe } from "../push/ausloeser";
import type { Nachricht } from "../push/push";

export const STUNDE_STANDARD = 19;
export const EINSTELLUNG = "wochencheck_stunde";
export const MAX_FEHLER = 5;
export const MAX_VORRANG = 280;
const MAX_ZEILE = 200;

export const PUNKTE = [
  { id: "kennzahlen", titel: "Drei Kennzahlen: besser oder schlechter als letzte Woche?", link: "/" },
  { id: "proben", titel: "Rote Abnahme-Proben und rote Läufe mit Grund (Top 3)", link: "/abnahme" },
  { id: "kosten", titel: "Kosten der Woche je Dienst, Ausreißer", link: "/kosten" },
  { id: "stichprobe", titel: "Stichprobe: 5 zufällige neue Einheiten mit Sicherheitsbezug, Fehler melden", link: null },
  { id: "freigaben", titel: "Offene Freigaben und sinan-Issues", link: "/freigabe" },
  { id: "vorrang", titel: "Eine Sache, die nächste Woche Vorrang hat", link: null },
] as const;

export type Ergebnis = { haken: string[]; fehler: string[]; vorrang: string };

/** Ganze Stunde 0 bis 23 aus der Einstellung; alles andere fällt auf 19 Uhr zurück. */
export function pushStunde(wert: string | undefined): number {
  const n = Number(wert);
  return wert !== undefined && /^\d{1,2}$/.test(wert) && n <= 23 ? n : STUNDE_STANDARD;
}

/** Sonntags ab `stunde` (Berlin) bis zur Ruhezeit, einmal je Tag. Fällt der Lauf zur vollen Stunde aus, kommt der nächste. */
export function pushVorbereiten(jetzt: number, stunde: number, gesendet: ReadonlySet<string>): { schluessel: string; nachricht: Nachricht } | null {
  const { tag, stunde: h } = berlinZeit(jetzt);
  const schluessel = `wochencheck:${tag}`;
  if (new Date(`${tag}T12:00:00Z`).getUTCDay() !== 0 || h < stunde || inRuhe(jetzt) || gesendet.has(schluessel)) return null;
  return { schluessel, nachricht: { titel: "Wochen-Check", text: "30 Minuten für die Kontrolle der Woche. Sechs Punkte zum Abhaken.", url: "/wochen-check" } };
}

/** Prüft den Body; null bei falscher Form, mehr als 5 Fehlerzeilen oder zu langem Vorrang. Unbekannte Haken fallen weg. */
export function ergebnisEingabe(body: unknown): Ergebnis | null {
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  if (!o || !Array.isArray(o.haken) || (o.fehler !== undefined && typeof o.fehler !== "string") || (o.vorrang !== undefined && typeof o.vorrang !== "string")) return null;
  const fehler = String(o.fehler ?? "").split("\n").map((z) => z.trim()).filter(Boolean);
  const vorrang = String(o.vorrang ?? "").trim().replace(/\s+/g, " ");
  if (fehler.length > MAX_FEHLER || fehler.some((z) => z.length > MAX_ZEILE) || vorrang.length > MAX_VORRANG) return null;
  const haken = o.haken;
  return { haken: PUNKTE.filter((p) => haken.includes(p.id)).map((p) => p.id), fehler, vorrang };
}

export const notizPfad = (tag: string): string => `Tage/${tag}-wochencheck.md`;

/** Notiz für den Vault; `issues` sind die angelegten Linear-Kennungen (Korrekturen, Vorrang). */
export function ergebnisMarkdown(tag: string, e: Ergebnis, issues: readonly string[]): string {
  return [
    `# Wochen-Check ${tag} #wochencheck`,
    "",
    ...PUNKTE.map((p) => `- [${e.haken.includes(p.id) ? "x" : " "}] ${p.titel}`),
    "",
    "## Fehler aus der Stichprobe",
    ...(e.fehler.length ? e.fehler.map((z) => `- ${z}`) : ["Keine."]),
    "",
    `Vorrang nächste Woche: ${e.vorrang || "nicht gesetzt"}`,
    ...(issues.length ? ["", `Linear: ${issues.join(", ")}`] : []),
    "",
    `[[Tage/${tag}]] · [[00 Wo stehen wir]]`,
  ].join("\n") + "\n";
}
