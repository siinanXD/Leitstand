import assert from "node:assert/strict";
import { test } from "node:test";
import { bewerte, geaenderteZeilen, kommentar, leseVorfunde, type Folgerunde, type Fund } from "./pruefer";

const dateien = ["docs/a.md"];
const hoch = (o: Partial<Fund> = {}): Fund => ({ datei: "src/a.ts", zeile: 10, schwere: "hoch", text: "Neuer Fund", art: "codefehler", ...o });
const folge: Folgerunde = {
  funde: [{ datei: "src/b.ts", zeile: 5, schwere: "hoch", text: "Alter Fund" }],
  geaendert: new Map([["src/c.ts", [[20, 25]]]]),
};
const lauf = (f: Fund, fl?: Folgerunde) => bewerte({ bestanden: false, funde: [f] }, dateien, false, undefined, fl);

test("Folgerunde: neuer hoch-Fund an unveränderter Zeile wird mittel", () => {
  const e = lauf(hoch(), folge);
  assert.equal(e.funde[0].schwere, "mittel");
  assert.equal(e.bestanden, true);
});

test("Erste Runde: hoch bleibt hoch", () => {
  assert.equal(lauf(hoch()).funde[0].schwere, "hoch");
});

test("Folgerunde: ungelöster Vorrunden-Fund bleibt hoch", () => {
  assert.equal(lauf(hoch({ datei: "src/b.ts", zeile: 5, text: "anders formuliert" }), folge).funde[0].schwere, "hoch");
  assert.equal(lauf(hoch({ datei: "src/b.ts", zeile: 9, text: "Alter Fund" }), folge).funde[0].schwere, "hoch");
});

test("Folgerunde: geänderte Zeile bleibt hoch", () => {
  assert.equal(lauf(hoch({ datei: "src/c.ts", zeile: 22 }), folge).funde[0].schwere, "hoch");
  assert.equal(lauf(hoch({ datei: "src/c.ts", zeile: 26 }), folge).funde[0].schwere, "mittel");
});

test("Folgerunde: art sicherheit und Sicherheitsbezug bleiben hoch", () => {
  assert.equal(lauf(hoch({ art: "sicherheit" }), folge).funde[0].schwere, "hoch");
  assert.equal(lauf(hoch({ text: "Service-Role-Key im Client" }), folge).funde[0].schwere, "hoch");
});

test("Folgerunde: Funde ohne Zeile (Beleg fehlt) bleiben hoch", () => {
  assert.equal(lauf(hoch({ zeile: 0 }), folge).funde[0].schwere, "hoch");
});

test("Vorfunde und geänderte Zeilen werden gelesen", () => {
  const k = kommentar({ bestanden: false, funde: [hoch({ text: "Zeile  kaputt" }), hoch({ datei: "(Diff)", zeile: 0, schwere: "mittel", text: "gekürzt" })] }, "m", null);
  assert.deepEqual(leseVorfunde(k).map(f => [f.schwere, f.datei, f.zeile, f.text]), [["hoch", "src/a.ts", 10, "Zeile kaputt"], ["mittel", "(Diff)", 0, "gekürzt"]]);
  const diff = "+++ b/src/x.ts\n@@ -1,2 +3,4 @@\n@@ -9 +12 @@\n+++ /dev/null\n@@ -1 +0,0 @@";
  assert.deepEqual(geaenderteZeilen(diff).get("src/x.ts"), [[3, 6], [12, 12]]);
  assert.equal(geaenderteZeilen(diff).size, 1);
});
