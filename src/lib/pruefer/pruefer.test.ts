import assert from "node:assert/strict";
import { test } from "node:test";
import { istKontingentFehler, pruefeMitRueckfall, reviewerZeile, begrenze, bewerte, brauchtProbe, kommentar, kostenUsd, leseAntwort, lesePreise, maxDiffZeichen, KOSTENDECKEL_USD, MAX_AUSGABE_TOKENS } from "./pruefer";

import { entscheide, leseHaken } from "../loop/haken";

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
  assert.equal(reviewerZeile("codex"), "Reviewer: OpenAI API");
  assert.equal(reviewerZeile("claude"), "Reviewer: Anthropic API (Rückfall, OpenAI-API-Kontingent erschöpft)");
  assert.match(kommentar(gut, "m", null, "claude"), /Reviewer: Anthropic API \(Rückfall/);
  assert.match(kommentar(gut, "m", null), /Reviewer: OpenAI API/);
});

const probeDateien = ["src/a.ts", "docs/abnahme.yml"];
const phasenAuftrag = "- [ ] Neue Auswahl ist getestet\n- [ ] [nach Aktivierung] Echter Folge-Merge mit Run-Link";

test("Merge-Prüfung lässt explizite Live-Abnahme offen und verhindert damit Done", () => {
  const e = bewerte({ ...gut, haken: [
    { text: "Neue Auswahl ist getestet", belegt: true, beleg: "src/a.test.ts" },
    { text: "[nach Aktivierung] Echter Folge-Merge mit Run-Link", belegt: true, beleg: "simulierter Test" },
    { text: "[nach Aktivierung] Echter Folge-Merge mit Run-Link", belegt: true, beleg: "kopierter doppelter Beleg" },
  ] }, probeDateien, false, phasenAuftrag);
  assert.equal(e.bestanden, true);
  assert.equal(e.haken?.find(h => h.text.startsWith("[nach Aktivierung]"))?.belegt, false);
  assert.equal(entscheide({ haken: leseHaken(phasenAuftrag), belege: e.haken ?? [], teil: false, runde: 0 }).status, "offen");
});

test("Merge-Prüfung: fehlender oder leerer Codebeleg sperrt trotz Modell-Erfolg", () => {
  for (const haken of [[], [{ text: "Neue Auswahl ist getestet", belegt: true, beleg: " " }]]) {
    const e = bewerte({ ...gut, haken }, probeDateien, false, phasenAuftrag);
    assert.equal(e.bestanden, false);
    assert.ok(e.funde.some(f => f.schwere === "hoch"));
  }
});

test("Ohne explizite Phasenmarkierung bleibt ein Live-Kriterium vor Merge verpflichtend", () => {
  const e = bewerte({ ...gut, haken: [] }, probeDateien, false, "- [ ] Echter Live-Lauf muss belegt sein");
  assert.equal(e.bestanden, false);
});

test("Explizite spätere Abnahme hebt einen echten Sicherheitsbefund nicht auf", () => {
  const e = bewerte({ bestanden: true, funde: [{ datei: "a", zeile: 1, schwere: "hoch", text: "Secret wird öffentlich ausgegeben" }] }, probeDateien, false, "- [ ] [nach Aktivierung] Live-Lauf");
  assert.equal(e.bestanden, false);
});

test("Modellvarianten von späteren Kriterien können den normalisierten Done-Abgleich nicht umgehen", () => {
  const auftrag = "- [ ] [nach Aktivierung] Live-Lauf";
  for (const text of ["[nach aktivierung] Live-Lauf", "**[nach Aktivierung]** Live-Lauf", "`[nach Aktivierung]` Live-Lauf"]) {
    const e = bewerte({ ...gut, haken: [{ text, belegt: true, beleg: "simuliert" }] }, probeDateien, false, auftrag);
    assert.equal(e.bestanden, true);
    assert.deepEqual(e.haken?.map(h => [h.text, h.belegt]), [["[nach Aktivierung] Live-Lauf", false]]);
    assert.equal(entscheide({ haken: leseHaken(auftrag), belege: e.haken ?? [], teil: false, runde: 0 }).status, "offen");
  }
});

test("Normgleiche doppelte Auftragshaken bleiben gesperrt statt eine Live-Abnahme zu erledigen", () => {
  const auftrag = "- [ ] [nach Aktivierung] Live-Lauf\n- [ ] **[nach Aktivierung]** Live-Lauf";
  const e = bewerte({ ...gut, haken: [{ text: "**[nach Aktivierung]** Live-Lauf", belegt: true, beleg: "simuliert" }] }, probeDateien, false, auftrag);
  assert.equal(e.bestanden, false);
  assert.ok(e.haken?.every(h => !h.belegt));
  assert.equal(entscheide({ haken: leseHaken(auftrag), belege: e.haken ?? [], teil: false, runde: 0 }).status, "offen");
});

// SIN-877: Fixtures nach den Befunden von #302 (0ab279f) und #308 (e7f3dfa); der Wortlaut der Original-Antworten war offline nicht abrufbar.
const markiert = "- [ ] \\[nach Aktivierung\\] Neuer Lauf ohne hoch-Befund";
const hoch = (text: string) => ({ datei: "x", zeile: 1, schwere: "hoch" as const, text });

test("SIN-877: Fund nur zu markiertem Haken ist nie hoch (#308)", () => {
  const e = bewerte({ bestanden: false, funde: [hoch("Der Haken [nach Aktivierung] ist offen; das ist kein Merge-Fehler.")] }, ["docs/a.md"], false, markiert);
  assert.equal(e.funde[0].schwere, "mittel");
  assert.equal(e.bestanden, true);
});

test("SIN-877: Live-Nachweis-Befunde aus #302 sperren nicht", () => {
  const funde = ["Live-Nachweis fehlt für [nach Aktivierung] Lauf", "[nach Aktivierung]: kein Run-Link im PR", "Design-Entscheidung zu [nach Aktivierung] nicht belegt"].map(hoch);
  const e = bewerte({ bestanden: false, funde }, ["docs/a.md"], false);
  assert.equal(e.funde.some((f) => f.schwere === "hoch"), false);
  assert.equal(e.bestanden, true);
});

test("SIN-877: Sicherheitsfund bleibt hoch (Negativtest)", () => {
  const e = bewerte({ bestanden: true, funde: [hoch("Secret wird bei [nach Aktivierung] geleakt")] }, ["docs/a.md"], false);
  assert.equal(e.funde[0].schwere, "hoch");
  assert.equal(e.bestanden, false);
});

test("Tatsächliches Linear-Markdown-Escaping erhält die explizite Nachaktivierungsphase", () => {
  const text = "\\[nach Aktivierung\\] Live-Lauf";
  const auftrag = `- [ ] ${text}`;
  const e = bewerte({ ...gut, haken: [{ text, belegt: true, beleg: "simuliert" }] }, probeDateien, false, auftrag);
  assert.equal(e.bestanden, true);
  assert.deepEqual(e.haken?.map(h => [h.text, h.belegt]), [[text, false]]);
  assert.equal(entscheide({ haken: leseHaken(auftrag), belege: e.haken ?? [], teil: false, runde: 0 }).status, "offen");
});
