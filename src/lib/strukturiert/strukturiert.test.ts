import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Schema } from "../autonomy/schema";
import { leseVorschlag } from "../lernen/schleife";
import { leseAusgaben } from "../marketing/marketing";
import { leseDateien } from "../vorarbeiter/vorarbeiter";
import { frageStrukturiert, leseStrukturiert, SCHEMA_DATEIEN, SCHEMA_MARKETING, schemaVorschlag } from "./strukturiert";

const lernen = JSON.parse(readFileSync("docs/schemas/lernen.json", "utf8")) as Schema;
const anzeige = (plattform: string) => ({ plattform, ueberschrift: "Titel", text: "Text", zielgruppe: "Ausbilder", budgetEurProWoche: 50 });
const marketing = {
  landingPage: { titel: "A", text: "B" },
  anzeigen: ["google", "meta", "linkedin"].map(anzeige),
  leadMagnet: { titel: "C", text: "D" },
  clipAuftrag: { prompt: "E", dauerSekunden: 30 },
  metricoolEntwurf: { text: "F" },
};
const dateien = { dateien: [{ pfad: "docs/x.md", inhalt: "# x" }] };
const vorschlag = { datei: "AGENTS.md", zeile: "- Eine Regel mit genug Text.", erwartet: "Reparaturquote 23 % → unter 15 %" };

test("Helfer lehnt Antwort ohne Pflichtfeld mit Grund ab", () => {
  const ohne = { ...marketing, leadMagnet: undefined };
  assert.throws(() => leseStrukturiert(JSON.stringify(ohne), SCHEMA_MARKETING), /Schema.*leadMagnet: fehlt/);
  assert.throws(() => leseStrukturiert(JSON.stringify({ dateien: [] }), SCHEMA_DATEIEN), /weniger als 1/);
  assert.throws(() => leseStrukturiert("Hier: Text", SCHEMA_DATEIEN), /kein JSON/);
  assert.throws(() => leseStrukturiert("{}", SCHEMA_DATEIEN), /dateien: fehlt/);
});

test("Fixtures: Vorarbeiter-, Marketing- und Lernen-Schema nehmen gültige Antworten an", () => {
  assert.deepEqual(leseDateien(leseStrukturiert(JSON.stringify(dateien), SCHEMA_DATEIEN), ["docs/x.md"]), dateien.dateien);
  assert.ok(leseAusgaben(leseStrukturiert(JSON.stringify(marketing), SCHEMA_MARKETING)));
  const s = schemaVorschlag(lernen);
  assert.ok(leseVorschlag(leseStrukturiert(JSON.stringify(vorschlag), s), { produkt: "leitstand", wert: "reparatur_anteil", vorher: 0.23 }, [], 0.01));
  assert.throws(() => leseStrukturiert(JSON.stringify({ ...vorschlag, datei: "src/app.ts" }), s), /datei: passt nicht/);
  assert.throws(() => leseStrukturiert(JSON.stringify({ ...vorschlag, extra: 1 }), s), /extra: unbekanntes Feld/);
  assert.throws(() => leseStrukturiert(JSON.stringify({ ...marketing, anzeigen: marketing.anzeigen.slice(1) }), SCHEMA_MARKETING), /anzeigen: weniger als 3/);
});

test("frageStrukturiert sendet das Schema ohne lokale Grenzen und meldet abgeschnittene Antworten", async () => {
  let body: { output_config: { format: { schema: { properties: { dateien: { minItems?: number } } } } } } | null = null;
  const abruf = (stop: string) =>
    (async (_u: unknown, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ stop_reason: stop, content: [{ type: "text", text: JSON.stringify(dateien) }], usage: { input_tokens: 3, output_tokens: 4 } }));
    }) as typeof fetch;
  const p = { key: "k", modell: "m", maxTokens: 10, prompt: "p", schema: SCHEMA_DATEIEN };
  assert.deepEqual(await frageStrukturiert({ ...p, abruf: abruf("end_turn") }), { wert: dateien, ein: 3, aus: 4 });
  assert.equal(body!.output_config.format.schema.properties.dateien.minItems, undefined);
  await assert.rejects(frageStrukturiert({ ...p, abruf: abruf("max_tokens") }), /abgeschnitten/);
  await assert.rejects(frageStrukturiert({ ...p, key: undefined }), /API_KEY fehlt/);
});

test("kein Ausschneiden von JSON aus Freitext mehr in scripts/", () => {
  let treffer = "";
  try {
    treffer = execFileSync("git", ["grep", "-n", "indexOf(\"{\")", "--", "scripts/"], { encoding: "utf8" });
  } catch {
    // git grep endet ohne Treffer mit Exit 1
  }
  assert.equal(treffer, "");
});
