// Linear-Aufgaben mit Titel und Stand (Tabelle leitstand_aufgaben, gefüllt von scripts/push/ausloeser.ts). Rein.
// Grund (Sinan 13.10.): Ohne Titel stand überall „Eine Aufgabe“; „läuft gerade“ und „fertig“ kommen jetzt aus Linear selbst.
import { berlinerTag } from "./berlin";

export type AufgabeStatus = "offen" | "laeuft" | "fertig" | "abgebrochen";
export type Aufgabe = { issue: string; titel: string; projekt: string | null; status: AufgabeStatus; gestartet: string | null; fertig: string | null; labels: string[]; /** Fertig-Kriterien im Linear-Issue (SIN-754); null = keine Haken oder noch nicht gespiegelt. */ haken: { erledigt: number; gesamt: number } | null };

const STATUS: readonly AufgabeStatus[] = ["offen", "laeuft", "fertig", "abgebrochen"];
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const zeit = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);

/** Linear-Zustandstyp → unser Zustand. */
export function statusAusLinear(typ: string | null | undefined): AufgabeStatus {
  if (typ === "started") return "laeuft";
  if (typ === "completed") return "fertig";
  if (typ === "canceled") return "abgebrochen";
  return "offen";
}

/** Linear-Projektname → Projekt-Kennung des Leitstands. */
export function projektAusLinear(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.includes("lernapp") || n.includes("lern-app")) return "lernapp";
  if (n.includes("leitstand")) return "leitstand";
  return n.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || null;
}

export function parseAufgaben(raw: unknown): Aufgabe[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const o = r && typeof r === "object" ? (r as Record<string, unknown>) : null;
    const issue = o && text(o.issue);
    const titel = o && text(o.titel);
    if (!o || !issue || !titel) return [];
    const status = STATUS.includes(o.status as AufgabeStatus) ? (o.status as AufgabeStatus) : "offen";
    const labels = Array.isArray(o.labels) ? o.labels.filter((l): l is string => typeof l === "string") : [];
    const gesamt = Number(o.haken_gesamt);
    const erledigt = Number(o.haken_erledigt);
    const haken = Number.isInteger(gesamt) && gesamt > 0 && Number.isInteger(erledigt) && erledigt >= 0 && erledigt <= gesamt ? { erledigt, gesamt } : null;
    return [{ issue, titel, projekt: text(o.projekt), status, gestartet: zeit(o.gestartet_at), fertig: zeit(o.fertig_at), labels, haken }];
  });
}

/** Titel zu einer Kennung; null, wenn unbekannt. */
export const titelVon = (aufgaben: readonly Aufgabe[] | undefined, issue: string | null | undefined): string | null =>
  (issue && aufgaben?.find((a) => a.issue === issue)?.titel) || null;

/** Was die Helfer gerade bauen (Linear „In Arbeit“ mit Label `claude`), jüngster Start zuerst. Sammel-Issues wie SIN-242 stehen dauerhaft auf „In Arbeit“ und zählen nicht. */
export const laufende = (aufgaben: readonly Aufgabe[] | undefined): Aufgabe[] =>
  (aufgaben ?? []).filter((a) => a.status === "laeuft" && a.labels.includes("claude")).sort((a, b) => Date.parse(b.gestartet ?? "0") - Date.parse(a.gestartet ?? "0"));

/** Heute (Berliner Tag) fertig geworden, jüngste zuerst. */
export function heuteFertigAus(aufgaben: readonly Aufgabe[] | undefined, jetzt: Date): Aufgabe[] {
  const tag = (d: Date) => berlinerTag(d);
  const heute = tag(jetzt);
  return (aufgaben ?? [])
    .filter((a) => a.status === "fertig" && a.fertig && tag(new Date(a.fertig)) === heute && Date.parse(a.fertig) <= jetzt.getTime())
    .sort((a, b) => Date.parse(b.fertig!) - Date.parse(a.fertig!));
}
