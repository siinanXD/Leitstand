// Minimaler JSON-Schema-Prüfer für die Rollen-Ausgaben (SIN-543). Rein. Kann nur, was docs/schemas/*.json brauchen;
// shortcut: kein $ref, oneOf oder format, bei Bedarf auf Ajv umstellen (Ajv ist keine direkte Abhängigkeit).
export type Schema = {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean";
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Schema;
  enum?: unknown[];
  minLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
};

const typVon = (v: unknown) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);

/** Fehlerliste, leer = gültig. Pfade wie `treffer[0].url`. */
export function pruefeSchema(wert: unknown, schema: Schema, pfad = "$"): string[] {
  const t = typVon(wert);
  const passt = schema.type === undefined || t === schema.type || (schema.type === "integer" && Number.isInteger(wert));
  if (!passt) return [`${pfad}: erwartet ${schema.type}, ist ${t}`];
  const f: string[] = [];
  if (schema.enum && !schema.enum.includes(wert)) f.push(`${pfad}: nicht erlaubt (${schema.enum.join(", ")})`);
  if (typeof wert === "string") {
    if (schema.minLength !== undefined && wert.length < schema.minLength) f.push(`${pfad}: zu kurz`);
    if (schema.pattern && !new RegExp(schema.pattern).test(wert)) f.push(`${pfad}: passt nicht zu ${schema.pattern}`);
  }
  if (typeof wert === "number") {
    if (schema.minimum !== undefined && wert < schema.minimum) f.push(`${pfad}: unter ${schema.minimum}`);
    if (schema.maximum !== undefined && wert > schema.maximum) f.push(`${pfad}: über ${schema.maximum}`);
  }
  if (Array.isArray(wert) && schema.items) wert.forEach((x, i) => f.push(...pruefeSchema(x, schema.items!, `${pfad}[${i}]`)));
  if (t === "object") {
    const o = wert as Record<string, unknown>;
    for (const k of schema.required ?? []) if (!(k in o)) f.push(`${pfad}.${k}: fehlt`);
    for (const [k, v] of Object.entries(o)) {
      const s = schema.properties?.[k];
      if (s) f.push(...pruefeSchema(v, s, `${pfad}.${k}`));
      else if (schema.additionalProperties === false) f.push(`${pfad}.${k}: unbekanntes Feld`);
    }
  }
  return f;
}
