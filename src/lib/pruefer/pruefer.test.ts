import assert from "node:assert/strict";
import { test } from "node:test";
import { istKontingentFehler, pruefeMitRueckfall, reviewerZeile, begrenze, bewerte, brauchtProbe, kommentar, kostenUsd, leseAntwort, lesePreise, maxDiffZeichen, KOSTENDECKEL_USD, MAX_AUSGABE_TOKENS } from "./pruefer";

const gut = { bestanden: true, funde: [] };

test("PR mit Code, aber ohne Abnahme-Probe: nicht bestanden, Fund hoch", () => {
  const e = bewerte(gut, ["src/lib/x.ts", "src/lib/x.test.ts"], false);
  assert.equal(e.bestanden, false);
  assert.equal(e.funde[0].schwere, "hoch");
  assert.match(e.funde[0].text, /Abnahme-Probe/);
});

test("PR mit Probe bleibt bestanden; reine Doku braucht keine", () => {
  assert.equal(bewerte(gut, ["src/a.ts", "docs/abnahme.yml"], false).bestanden, true);
  assert.equal(brauchtProbe(["docs/FERTIG.md"]), false);
  assert.equal(bewerte(gut, ["docs/FERTIG.md"], false).bestanden, true);
});

test("Modell sagt hoch, aber bestanden=true: trotzdem nicht bestanden", () => {
  const e = bewerte({ bestanden: true, funde: [{ datei: "a", zeile: 1, schwere: "hoch", text: "x" }] }, ["docs/a.md"], false);
  assert.equal(e.bestanden, false);
});

test("gekürzter Diff ist ein Fund, aber nicht hoch", () => {
  const e = bewerte(gut, ["docs/a.md"], true);
  assert.equal(e.bestanden, true);
  assert.equal(e.funde[0].schwere, "mittel");
});

test("leseAntwort: gültig, ungültig", () => {
  assert.deepEqual(leseAntwort('{"bestanden":false,"funde":[{"datei":"a","zeile":3,"schwere":"hoch","text":"t"}]}').funde[0].zeile, 3);
  assert.throws(() => leseAntwort('{"bestanden":"ja","funde":[]}'));
  assert.throws(() => leseAntwort('{"bestanden":true,"funde":[{"datei":"a","zeile":1,"schwere":"kritisch","text":"t"}]}'));
});

test("Kosten und Deckel: Eingabe plus volle Ausgabe bleiben unter 0,10 $", () => {
  const p = { ein: 2, aus: 8 };
  const max = maxDiffZeichen(p);
  const usd = kostenUsd({ eingabe: (max + 4000) / 3, ausgabe: MAX_AUSGABE_TOKENS }, p);
  assert.ok(usd <= KOSTENDECKEL_USD, String(usd));
  assert.equal(kostenUsd({ eingabe: 1_000_000, ausgabe: 0 }, p), 2);
});

test("lesePreise: fehlend oder ungültig ist null", () => {
  assert.equal(lesePreise(undefined, "1"), null);
  assert.equal(lesePreise("0", "1"), null);
  assert.deepEqual(lesePreise("1,5", "6"), { ein: 1.5, aus: 6 });
});

test("begrenze kürzt nur zu lange Diffs", () => {
  assert.deepEqual(begrenze("abc", 5), { text: "abc", gekuerzt: false });
  assert.deepEqual(begrenze("abcdef", 3), { text: "abc", gekuerzt: true });
});

test("kommentar nennt Ergebnis, Fund und Kosten", () => {
  const t = kommentar({ bestanden: false, funde: [{ datei: "a.ts", zeile: 4, schwere: "hoch", text: "Spalte falsch" }] }, "m", 0.0123);
  assert.match(t, /nicht bestanden/);
  assert.match(t, /a\.ts:4/);
  assert.match(t, /risk:high/);
  assert.match(t, /0\.0123/);
});

test("istKontingentFehler: 429 und insufficient_quota ja, 500 und 401 nein", () => {
  assert.equal(istKontingentFehler(429, ""), true);
  assert.equal(istKontingentFehler(403, "insufficient_quota"), true);
  assert.equal(istKontingentFehler(500, "boom"), false);
  assert.equal(istKontingentFehler(401, "invalid key"), false);
});

test("Rückfall: Codex ok bleibt Codex, Kontingent leer geht an Claude, echter Fehler bleibt Fehler", async () => {
  const kein = async () => {
    throw new Error("darf nicht laufen");
  };
  assert.deepEqual(await pruefeMitRueckfall(async () => 1, kein), { r: 1, reviewer: "codex" });
  const leer = async () => {
    throw Object.assign(new Error("limit"), { kontingent: true });
  };
  assert.deepEqual(await pruefeMitRueckfall(leer, async () => 2), { r: 2, reviewer: "claude" });
  await assert.rejects(pruefeMitRueckfall(async () => Promise.reject(new Error("HTTP 500")), async () => 3), /HTTP 500/);
});

test("reviewerZeile und kommentar nennen den Reviewer", () => {
  assert.equal(reviewerZeile("codex"), "Reviewer: Codex");
  assert.equal(reviewerZeile("claude"), "Reviewer: Claude (Rückfall, Codex-Kontingent erschöpft)");
  assert.match(kommentar(gut, "m", null, "claude"), /Reviewer: Claude \(Rückfall/);
  assert.match(kommentar(gut, "m", null), /Reviewer: Codex/);
});
