import assert from "node:assert/strict";
import { test } from "node:test";
import { ampelVon, avvLuecken, betrifftRecht, brauchtMensch, kommentar, pruefeDiff, pruefeWerbemittel } from "./anwalt";

const diff = (datei: string, ...zeilen: string[]) => [`--- a/${datei}`, `+++ b/${datei}`, "@@ -0,0 +1 @@", ...zeilen.map((z) => `+${z}`)].join("\n");

test("Fixture: neue Tracking-Zeile ohne Einwilligung → rot und needs-human", () => {
  const funde = pruefeDiff(diff("src/lib/tracking.ts", 'posthog.capture("seite_besucht");'));
  assert.equal(ampelVon(funde), "rot");
  assert.equal(brauchtMensch(funde), true);
  assert.match(kommentar(funde, ["src/lib/tracking.ts"]), /needs-human/);
});

test("Tracking mit Einwilligungsprüfung im selben Diff ist nicht rot", () => {
  const funde = pruefeDiff(diff("src/lib/tracking.ts", "if (hatEinwilligung()) {", 'posthog.capture("x");', "}"));
  assert.equal(ampelVon(funde), "gruen");
});

test("Migration: Personenfeld ohne Rechtsgrundlage ist gelb, mit Kommentar grün", () => {
  assert.equal(ampelVon(pruefeDiff(diff("supabase/migrations/a/1.sql", "  email text"))), "gelb");
  assert.equal(ampelVon(pruefeDiff(diff("supabase/migrations/a/1.sql", "-- Rechtsgrundlage: Art. 6 (1) b", "  email text"))), "gruen");
});

test("E-Mail im Prompt ist rot, in einem Test nicht", () => {
  assert.equal(ampelVon(pruefeDiff(diff("src/lib/x/prompt.ts", "Schreib an max@example.de"))), "rot");
  assert.equal(ampelVon(pruefeDiff(diff("src/lib/x/prompt.test.ts", "max@example.de"))), "gruen");
});

test("betrifft Recht: Pfade", () => {
  assert.equal(betrifftRecht("supabase/migrations/leitstand/1.sql"), true);
  assert.equal(betrifftRecht("src/app/datenschutz/page.tsx"), true);
  assert.equal(betrifftRecht("src/lib/ablauf.ts"), false);
});

test("AVV: alle 8 Dienste in docs/recht/AVV.md mit Link, sonst Lücke", async () => {
  const { readFileSync } = await import("node:fs");
  const avv = readFileSync("docs/recht/AVV.md", "utf8");
  const luecken = avvLuecken(avv, []).map((l) => l.dienst);
  assert.deepEqual(luecken, ["Higgsfield"]);
  assert.deepEqual(avvLuecken("| Supabase | https://x |", [{ name: "package.json", text: "@supabase/x" }]).find((l) => l.dienst === "Sentry"), { dienst: "Sentry", grund: "fehlt", benutzt: false });
});

test("Werbemittel: Kennzeichnung, Fremdmarke, Personendaten", () => {
  assert.deepEqual(pruefeWerbemittel({ text: "Hallo", kiKennzeichnung: "mit KI erstellt" }), []);
  assert.equal(pruefeWerbemittel({ text: "Hallo", kiKennzeichnung: null }).length, 1);
  assert.match(pruefeWerbemittel({ text: "Besser als Amazon", kiKennzeichnung: "mit KI erstellt" })[0], /Amazon/);
  assert.deepEqual(pruefeWerbemittel({ text: "Google Anzeige", kiKennzeichnung: "mit KI erstellt" }, ["Google"]), []);
  assert.match(pruefeWerbemittel({ text: "a@b.de", kiKennzeichnung: "mit KI erstellt" })[0], /E-Mail/);
});
