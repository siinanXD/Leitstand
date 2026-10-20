import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { bewerte, leseAntwort, type Fund } from "./pruefer";
import { leseBelege } from "../loop/haken";

const dateien = ["src/a.ts", "docs/abnahme.yml"];
const haken = "[nach Aktivierung] Echter Live-Lauf";
const auftrag = `- [ ] ${haken}`;
const fund = (extra = {}) => ({ datei: "src/a.ts", zeile: 7, schwere: "hoch", text: "Kein Run-Link", art: "nachweis", haken, ...extra });
const antwort = (funde: unknown[], bestanden = false) => leseAntwort(JSON.stringify({ bestanden, funde }));

test("SIN-877: nur ausdrücklich zugeordneter späterer Nachweis wird herabgestuft, auch mit Codestelle", () => {
  const e = bewerte(antwort([fund()]), dateien, false, auftrag);
  assert.equal(e.funde[0].schwere, "mittel");
  assert.equal(e.bestanden, true);
  assert.equal(e.haken?.[0].belegt, false);
});

test("SIN-877: fehlende, unbekannte und unmarkierte Zuordnung bleiben gesperrt", () => {
  for (const text of [undefined, "", "- [ ] Echter Live-Lauf", "- [ ] [nach Aktivierung] Anderer Live-Lauf"]) {
    assert.equal(bewerte(antwort([fund()]), dateien, false, text).bestanden, false);
  }
  for (const extra of [{ art: undefined }, { haken: null }, { haken: "Anderes" }]) {
    assert.equal(bewerte(antwort([fund(extra)]), dateien, false, auftrag).funde[0].schwere, "hoch");
  }
});

test("SIN-877: Code-, Sicherheits- und alte unklassifizierte Funde bleiben hoch, auch ohne Codestelle", () => {
  for (const art of [undefined, "codefehler", "sicherheit"]) {
    for (const text of ["Zugang wird offengelegt", "Rechte eskalieren", "Daten gehen verloren", "Fehler bei [nach Aktivierung]"]) {
      const e = bewerte(antwort([fund({ art, text, datei: "(Issue)", zeile: 0 })]), dateien, false, auftrag);
      assert.equal(e.funde[0].schwere, "hoch");
      assert.equal(e.bestanden, false);
    }
  }
});

test("SIN-877: keine pauschale Umkehr von bestanden=false; Pflichtbelege und Probe bleiben zwingend", () => {
  assert.equal(bewerte(antwort([]), dateien, false, auftrag).bestanden, false);
  assert.equal(bewerte(antwort([fund(), fund({ art: "codefehler", schwere: "mittel" })]), dateien, false, auftrag).bestanden, false);
  assert.equal(bewerte(antwort([fund()]), dateien, false, `${auftrag}\n- [ ] Pflicht-Test`).bestanden, false);
  assert.equal(bewerte(antwort([fund()]), ["src/a.ts"], false, auftrag).bestanden, false);
});

test("SIN-877: Linear-Escaping wird zugeordnet, widersprüchliche Phasen bleiben gesperrt", () => {
  const escaped = "- [ ] \\[nach Aktivierung\\] Echter Live-Lauf";
  assert.equal(bewerte(antwort([fund()]), dateien, false, escaped).bestanden, true);
  assert.equal(bewerte(antwort([fund()]), dateien, false, `${auftrag}\n- [ ] **[nach Aktivierung]** Echter Live-Lauf`).bestanden, false);
});

test("SIN-877: Parser verwirft ungültige Klassifikation und Zuordnung statt sie zu verlieren", () => {
  for (const extra of [{ art: "sicher" }, { art: null }, { haken: 42 }]) assert.throws(() => antwort([fund(extra)]));
});

// Unveränderte veröffentlichte Review-Kommentare; keine behaupteten Rohantworten der API.
function original(n: number) {
  const f = JSON.parse(readFileSync(`src/lib/pruefer/fixtures/review-${n}.json`, "utf8"));
  const haken = leseBelege([f.kommentar]) ?? [];
  const funde: Fund[] = [...f.kommentar.matchAll(/^- \*\*(hoch|mittel|niedrig)\*\* `([^`]+)`: (.+)$/gm)].map(m => {
    const stelle = /^(.*):(\d+)$/.exec(m[2]);
    return { schwere: m[1] as Fund["schwere"], datei: stelle?.[1] ?? m[2], zeile: Number(stelle?.[2] ?? 0), text: m[3] };
  });
  return { f, modell: { bestanden: false, funde, haken }, auftrag: haken.map(h => `- [ ] ${h.text}`).join("\n") };
}

test("SIN-877: echtes #302-Review (0ab279f) bleibt ohne neue Klassifikation konservativ", () => {
  const { f, modell, auftrag } = original(302);
  assert.match(f.kommentar, /0ab279f0/);
  assert.equal(modell.funde.length, 4);
  assert.equal(bewerte(modell, dateien, false, auftrag).funde.filter(f => f.schwere === "hoch").length, 3);
  // Nur der vierte Originalfund betrifft ausschließlich die zwei ausdrücklich späteren Live-Nachweise.
  const live = modell.haken.find(h => h.text.includes("Subagent-Aufruf"))!.text;
  const klassifiziert = { ...modell, funde: modell.funde.map((f, i) => i === 3 ? { ...f, art: "nachweis" as const, haken: live } : f) };
  const e = bewerte(klassifiziert, dateien, false, auftrag);
  assert.deepEqual(e.funde.map(f => f.schwere), ["hoch", "mittel", "hoch", "mittel"]);
  assert.equal(e.bestanden, false);
  assert.equal(bewerte({ ...klassifiziert, funde: [klassifiziert.funde[3]] }, dateien, false, auftrag).bestanden, true);
});

test("SIN-877: echtes #308-Review (e7f3dfa) behält unmarkierte Pagination-Blocker trotz Erwähnung späterer Abnahme", () => {
  const { f, modell, auftrag } = original(308);
  assert.match(f.kommentar, /e7f3dfafe/);
  assert.equal(modell.funde.length, 3);
  const e = bewerte(modell, dateien, false, auftrag);
  assert.equal(e.bestanden, false);
  assert.deepEqual(e.funde.slice(0, 3).map(f => f.schwere), ["hoch", "mittel", "hoch"]);
});
