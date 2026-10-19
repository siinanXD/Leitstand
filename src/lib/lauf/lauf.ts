/**
 * Output-Vertrag für Agenten-Läufe (SIN-836). Rein, Speicher wird übergeben (Supabase im Betrieb, Fake im Test).
 * Das Ergebnis wird gegen das vorhandene Rollen-Schema (docs/schemas, SIN-491) geprüft, keine zweite Definition.
 * Schema-Prüfung ist keine fachliche Wahrheitsprüfung; dafür bleiben die Abnahme-Proben (SIN-626).
 */
import { createHash } from "node:crypto";
import bauen from "../../../docs/schemas/bauen.json";
import { pruefeSchema, type Schema } from "../autonomy/schema";

export const SCHEMA_VERSION = "1";
/** shortcut: nur die Pilot-Rolle, weitere Rollen hier eintragen, sobald der Pilot belegt ist. */
const ROLLEN: Record<string, Schema> = { bauen: bauen as Schema };

const HUELLE: Schema = {
  type: "object",
  required: ["run_id", "agent", "issue", "schema_version", "result", "artifacts", "kosten_eur", "zeitpunkt"],
  properties: {
    run_id: { type: "string", pattern: "^[A-Za-z0-9_-]{8,64}$" },
    agent: { type: "string", minLength: 1 },
    issue: { type: "string", pattern: "^SIN-[0-9]+$" },
    schema_version: { type: "string", enum: [SCHEMA_VERSION] },
    result: { type: "object" },
    artifacts: {
      type: "array",
      items: {
        type: "object",
        required: ["pfad", "sha256"],
        properties: { pfad: { type: "string", minLength: 1 }, sha256: { type: "string", pattern: "^[0-9a-f]{64}$" } },
        additionalProperties: false,
      },
    },
    kosten_eur: { type: "number", minimum: 0 },
    zeitpunkt: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
};

export type Huelle = { run_id: string; agent: string; issue: string; schema_version: string; result: Record<string, unknown>; artifacts: { pfad: string; sha256: string }[]; kosten_eur: number; zeitpunkt: string };
export type Lauf = Huelle & { status: "validiert" | "completed"; pruefsumme: string };
export type Code = "ok" | "bereits_gespeichert" | "json_ungueltig" | "schema_ungueltig" | "konflikt" | "speicher_fehler";
export type Antwort = { code: Code; run_id?: string; fehler: string[]; folgestart: boolean };

/** Atomare Übergänge: `speichern` ist ein Upsert ohne Überschreiben, `bestaetigen` meldet nur beim echten Übergang true. */
export type Speicher = {
  holen(runId: string): Promise<Lauf | null>;
  speichern(lauf: Lauf): Promise<void>;
  bestaetigen(runId: string): Promise<boolean>;
  /** Geschützter Ablageort für Rohoutput und Dead-Letter, mit Grund als Auditspur. */
  verwerfen(eintrag: { run_id?: string; code: Code; grund: string; roh: string }): Promise<void>;
};

const sortiert = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(sortiert)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, sortiert(x)]))
      : v;
export const pruefsumme = (result: unknown) => createHash("sha256").update(JSON.stringify(sortiert(result))).digest("hex");

/** Nimmt eine Agenten-Ausgabe an. `completed` und `folgestart` gibt es nur nach bestätigter Speicherung. */
export async function nimmAn(roh: string, speicher: Speicher): Promise<Antwort> {
  const ab = async (code: Code, fehler: string[], run_id?: string): Promise<Antwort> => {
    // Auch das Protokoll kann scheitern; die Antwort bleibt trotzdem ein Fehler ohne Folgestart.
    await speicher.verwerfen({ run_id, code, grund: fehler.join("; "), roh }).catch(() => undefined);
    return { code, run_id, fehler, folgestart: false };
  };
  let h: unknown;
  try {
    h = JSON.parse(roh);
  } catch {
    return ab("json_ungueltig", ["Ausgabe ist kein JSON"]);
  }
  const lauf = h as Huelle;
  const fehler = pruefeSchema(h, HUELLE);
  const rolle = ROLLEN[lauf?.agent];
  if (!fehler.length && !rolle) fehler.push(`$.agent: keine Schema-Zuordnung für ${lauf.agent}`);
  if (!fehler.length) fehler.push(...pruefeSchema(lauf.result, rolle).map((f) => f.replace("$", "$.result")));
  if (fehler.length) return ab("schema_ungueltig", fehler, typeof lauf?.run_id === "string" ? lauf.run_id : undefined);

  const summe = pruefsumme(lauf.result);
  try {
    const alt = await speicher.holen(lauf.run_id);
    if (alt && alt.pruefsumme !== summe) return ab("konflikt", ["run_id existiert mit anderem Ergebnis"], lauf.run_id);
    if (alt?.status === "completed") return { code: "bereits_gespeichert", run_id: lauf.run_id, fehler: [], folgestart: false };
    if (!alt) await speicher.speichern({ ...lauf, status: "validiert", pruefsumme: summe });
    const jetzt = await speicher.bestaetigen(lauf.run_id);
    return { code: jetzt ? "ok" : "bereits_gespeichert", run_id: lauf.run_id, fehler: [], folgestart: jetzt };
  } catch (e) {
    return ab("speicher_fehler", [e instanceof Error ? e.message : "Speicher nicht erreichbar"], lauf.run_id);
  }
}
