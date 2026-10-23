// Rollen-Ausgabe als Datei (SIN-1045): CEO, Planer und Research schreiben ihr Ergebnis hierüber nach docs/autonomy/laeufe/<ISSUE-ID>.json.
// Geschrieben wird nur, was docs/schemas/<rolle>.json erfüllt; der Workflow prüft die Datei danach noch einmal mit scripts/autonomy/schema.ts.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Schema } from "../autonomy/schema";
import { AntwortFehler, leseStrukturiert } from "./strukturiert";

export type Gemeinsam = { zusammenfassung: string; naechster_schritt: string; status?: "fertig" | "blockiert" | "braucht_sinan"; quellen?: string[] };

/** Die Felder, die jede Rolle teilt; rollenspezifische Felder kommen in `extra`. Kosten sind 0: die Skripte rufen kein Modell auf. */
export function rollenErgebnis<T extends object>(rolle: string, issue: string, g: Gemeinsam, extra: T, jetzt = new Date()) {
  return { rolle, issue, zeitpunkt: jetzt.toISOString(), status: g.status ?? "fertig", zusammenfassung: g.zusammenfassung, naechster_schritt: g.naechster_schritt, kosten_eur: 0, quellen: g.quellen ?? [], ...extra };
}

/** Prüft gegen das Rollen-Schema und schreibt die Datei. Wirft AntwortFehler mit Grund, schreibt dann nichts. Standardpfad: docs/autonomy/laeufe/<issue>.json, überschreibbar mit `ERGEBNIS_DATEI` (Workflow: Temp-Pfad). */
export function schreibeErgebnis(rolle: string, ergebnis: { issue: string }, datei = process.env.ERGEBNIS_DATEI || `docs/autonomy/laeufe/${ergebnis.issue}.json`): string {
  const schema = JSON.parse(readFileSync(`docs/schemas/${rolle}.json`, "utf8")) as Schema;
  const text = JSON.stringify(ergebnis, null, 2) + "\n";
  try {
    leseStrukturiert(text, schema);
  } catch (e) {
    throw new AntwortFehler(`Ergebnis der Rolle ${rolle}: ${(e as Error).message}`);
  }
  mkdirSync(dirname(datei), { recursive: true });
  writeFileSync(datei, text);
  return datei;
}
