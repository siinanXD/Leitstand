// Strukturierte Modellausgabe (SIN-1035): Schema an die API geben, Antwort ganz parsen und gegen dasselbe Schema prüfen.
// Kein Ausschneiden von JSON aus Freitext, kein stilles Leerobjekt: jeder Verstoß wirft einen Fehler mit Grund. Das Netz steckt in `frageStrukturiert`, `fetch` ist einsetzbar.
import { pruefeSchema, type Schema } from "../autonomy/schema";

export type Antwort<T> = { wert: T; ein: number; aus: number };

/** Strikte API-Schemas kennen nur diese Schlüsselwörter; Grenzen (minLength, pattern, …) prüft `leseStrukturiert` lokal. */
function fuerApi(s: Schema): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (s.type) o.type = s.type;
  if (s.enum) o.enum = s.enum;
  if (s.properties) o.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, fuerApi(v)]));
  if (s.required) o.required = s.required;
  if (s.type === "object") o.additionalProperties = false;
  if (s.items) o.items = fuerApi(s.items);
  return o;
}

/** Antworttext → Wert. Wirft mit Grund, wenn der Text kein JSON ist oder dem Schema nicht entspricht. */
export function leseStrukturiert<T>(text: string, schema: Schema): T {
  let wert: unknown;
  try {
    wert = JSON.parse(text);
  } catch (e) {
    throw new Error(`Modellantwort ist kein JSON (${(e as Error).message})`);
  }
  const fehler = pruefeSchema(wert, schema);
  if (fehler.length) throw new Error(`Modellantwort verletzt das Schema: ${fehler.join("; ")}`);
  return wert as T;
}

type Parameter = { key: string | undefined; modell: string; maxTokens: number; prompt: string; schema: Schema; abruf?: typeof fetch; beiVerbrauch?: (ein: number, aus: number) => void | Promise<void> };

/** Ein Anthropic-Aufruf mit `output_config` (json_schema). Abgeschnittene oder abgelehnte Antworten sind Fehler. */
export async function frageStrukturiert<T>(p: Parameter): Promise<Antwort<T>> {
  if (!p.key) throw new Error("ANTHROPIC_API_KEY fehlt");
  const res = await (p.abruf ?? fetch)("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": p.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: p.modell, max_tokens: p.maxTokens, messages: [{ role: "user", content: p.prompt }], output_config: { format: { type: "json_schema", schema: fuerApi(p.schema) } } }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Modell: ${res.status}`);
  const j = (await res.json()) as { stop_reason?: string; content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
  const [ein, aus] = [j.usage?.input_tokens ?? 0, j.usage?.output_tokens ?? 0];
  await p.beiVerbrauch?.(ein, aus); // bezahlt ist der Aufruf auch, wenn die Antwort danach nicht taugt
  if (j.stop_reason === "max_tokens") throw new Error(`Modell: Tokenbudget (${p.maxTokens}) ausgeschöpft, Antwort abgeschnitten`);
  if (j.stop_reason === "refusal") throw new Error("Modell: Antwort abgelehnt (refusal)");
  const text = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  return { wert: leseStrukturiert<T>(text, p.schema), ein, aus };
}

const S: Schema = { type: "string", minLength: 1 };

/** Vorarbeiter Spur C: Dateien für das Docs-Issue. Die Pfad-Regeln des Issues prüft danach `leseDateien`. */
export const SCHEMA_DATEIEN: Schema = {
  type: "object",
  properties: { dateien: { type: "array", minItems: 1, maxItems: 5, items: { type: "object", properties: { pfad: { type: "string", pattern: "^docs/[\\w.\\-/]+\\.md$" }, inhalt: S }, required: ["pfad", "inhalt"], additionalProperties: false } } },
  required: ["dateien"],
  additionalProperties: false,
};

const ANZEIGE: Schema = { type: "object", properties: { plattform: { type: "string", enum: ["google", "meta", "linkedin"] }, ueberschrift: S, text: S, zielgruppe: S, budgetEurProWoche: { type: "number", minimum: 1 } }, required: ["plattform", "ueberschrift", "text", "zielgruppe", "budgetEurProWoche"], additionalProperties: false };
const TITEL_TEXT: Schema = { type: "object", properties: { titel: S, text: S }, required: ["titel", "text"], additionalProperties: false };

/** Marketing: die fünf Ausgaben (Form `Ausgaben` in src/lib/marketing/marketing.ts). */
export const SCHEMA_MARKETING: Schema = {
  type: "object",
  properties: {
    landingPage: TITEL_TEXT,
    anzeigen: { type: "array", minItems: 3, maxItems: 3, items: ANZEIGE },
    leadMagnet: TITEL_TEXT,
    clipAuftrag: { type: "object", properties: { prompt: S, dauerSekunden: { type: "number", minimum: 1, maximum: 60 } }, required: ["prompt", "dauerSekunden"], additionalProperties: false },
    metricoolEntwurf: { type: "object", properties: { text: S }, required: ["text"], additionalProperties: false },
  },
  required: ["landingPage", "anzeigen", "leadMagnet", "clipAuftrag", "metricoolEntwurf"],
  additionalProperties: false,
};

/** Lernen: Regelvorschlag des Modells, abgeleitet aus `vorschlag` in docs/schemas/lernen.json (nur die Felder, die das Modell liefert). */
export function schemaVorschlag(lernen: Schema): Schema {
  const felder = ["datei", "zeile", "erwartet"];
  const v = lernen.properties?.vorschlag;
  if (!v?.properties) throw new Error("docs/schemas/lernen.json: vorschlag fehlt");
  return { type: "object", properties: Object.fromEntries(felder.map((k) => [k, v.properties![k]])), required: felder, additionalProperties: false };
}
