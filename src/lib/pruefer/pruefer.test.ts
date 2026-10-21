import assert from "node:assert/strict";
import { test } from "node:test";
import { hatHoch, hatProbe, hatRisiko, prueferLabels, istKontingentFehler, pruefeMitRueckfall, reviewerZeile, begrenze, bewerte, brauchtProbe, kommentar, kostenUsd, leseAntwort, lesePreise, maxDiffZeichen, KOSTENDECKEL_USD, MAX_AUSGABE_TOKENS } from "./pruefer";

import { entscheide, leseHaken } from "../loop/haken";
import { labelWechsel, stufe } from "../../../scripts/loop/risiko.mjs";

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
  assert.match(t, /pruefer:offen/);
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

test("Tatsächliches Linear-Markdown-Escaping erhält die explizite Nachaktivierungsphase", () => {
  const text = "\\[nach Aktivierung\\] Live-Lauf";
  const auftrag = `- [ ] ${text}`;
  const e = bewerte({ ...gut, haken: [{ text, belegt: true, beleg: "simuliert" }] }, probeDateien, false, auftrag);
  assert.equal(e.bestanden, true);
  assert.deepEqual(e.haken?.map(h => [h.text, h.belegt]), [[text, false]]);
  assert.equal(entscheide({ haken: leseHaken(auftrag), belege: e.haken ?? [], teil: false, runde: 0 }).status, "offen");
});

test("SIN-880: leere und abgeschnittene Modellantworten nennen die Ursache ohne Rohinhalt", () => {
  assert.throws(() => leseAntwort(""), /leer.*Tokenbudget/);
  assert.throws(() => leseAntwort('{"secret":"privat"'), /ungültiges JSON/);
  assert.throws(() => leseAntwort('{"secret":"privat"'), e => !String(e).includes("privat"));
});

test("SIN-880: fehlgeschlagener Rückfall erhält beide Provider-Ursachen", async () => {
  await assert.rejects(pruefeMitRueckfall(
    async () => { throw Object.assign(new Error("OpenAI: HTTP 429: rate_limit"), { kontingent: true }); },
    async () => { throw new Error("Anthropic: HTTP 400: invalid_request"); },
  ), /OpenAI: HTTP 429: rate_limit.*Anthropic: HTTP 400: invalid_request/);
});

test("SIN-880: API-Fehler redigieren Keys vor Kürzung und behalten Status/Diagnose", async () => {
  const { apiFehler, leseApiJson } = await import("./pruefer");
  const e = apiFehler("OpenAI", 429, 'Bearer token-secret\n{"error":"insufficient_quota","key":"sk-test-secret"}', ["token-secret"]);
  assert.match(e.message, /OpenAI: HTTP 429/);
  assert.match(e.message, /insufficient_quota/);
  assert.doesNotMatch(e.message, /token-secret|sk-test-secret|\n/);
  assert.equal((e as Error & { kontingent: boolean }).kontingent, true);
  assert.ok(apiFehler("Anthropic", 400, "x".repeat(500), []).message.length < 330);
  assert.match(apiFehler("Anthropic", 400, "", []).message, /Antworttext leer/);
  assert.throws(() => leseApiJson("", "OpenAI"), /OpenAI: HTTP-Antwort/);
  assert.throws(() => leseAntwort("null"), /kein Objekt/);
});

test("SIN-909: Beleg fehlt setzt pruefer:offen, nicht risk:high; Sicherheitsfund schon", () => {
  const beleg = bewerte({ bestanden: false, funde: [], haken: [] }, ["docs/a.md"], false, "- [ ] Test belegt Haken");
  assert.equal(beleg.bestanden, false);
  assert.equal(hatHoch(beleg), true);
  assert.equal(hatRisiko(beleg), false);
  assert.match(kommentar(beleg, "m", null), /pruefer:offen/);
  assert.doesNotMatch(kommentar(beleg, "m", null), /setzt `risk:high`/);
  const leak = { bestanden: false, funde: [{ datei: "a.ts", zeile: 1, schwere: "hoch" as const, text: "Secret wird ausgegeben", art: "sicherheit" as const }] };
  assert.equal(hatRisiko(leak), true);
  assert.match(kommentar(leak, "m", null), /setzt `risk:high`/);
});

test("Test: Prüfer „nicht bestanden“ mit nur „Beleg fehlt“-Funden → pruefer:offen, nicht risk:high", () => {
  const beleg = bewerte({ bestanden: false, funde: [], haken: [] }, ["docs/a.md"], false, "- [ ] Test belegt Haken");
  const l = prueferLabels({ risiko: hatRisiko(beleg), bestanden: beleg.bestanden, labels: [] });
  assert.deepEqual(l, { add: ["pruefer:offen"], remove: [] });
});

test("Test: Neuer Head, Prüfer bestanden → pruefer:offen und ein durch Prüfer gesetztes risk:high werden entfernt", () => {
  // Prüfer entfernt pruefer:offen; das vom Prüfer gesetzte risk:high (Marker pruefer:hoch) senkt das Gate.
  const nachLauf = ["risk:high", "pruefer:hoch", "pruefer:offen"];
  assert.deepEqual(prueferLabels({ risiko: false, bestanden: true, labels: nachLauf }), { add: [], remove: ["pruefer:offen"] });
  const ohneOffen = nachLauf.filter((x) => x !== "pruefer:offen");
  const files = [{ filename: "README.md", status: "modified", patch: "+x" }];
  const { stufe: st } = stufe({ files, bekannt: new Set<string>(), labels: ohneOffen, pruefBestanden: true });
  assert.notEqual(st, "high");
  assert.deepEqual(labelWechsel({ labels: ohneOffen, stufe: st }).weg, ["risk:high", "pruefer:hoch"]);
});

test("SIN-909: von Hand gesetztes risk:high bleibt, auch nach bestandenem Prüfer", () => {
  assert.deepEqual(prueferLabels({ risiko: false, bestanden: true, labels: ["risk:high"] }).remove, []);
  assert.deepEqual(prueferLabels({ risiko: true, bestanden: false, labels: ["risk:high"] }).add, ["risk:high"]);
  const { stufe: st } = stufe({ files: [{ filename: "README.md", status: "modified", patch: "+x" }], bekannt: new Set<string>(), labels: ["risk:high"], pruefBestanden: true });
  assert.equal(st, "high");
});

test("SIN-921: Codefehler mit dem Wort Token ist kein Sicherheitsrisiko, art=sicherheit schon", () => {
  const fund = (art: "codefehler" | "sicherheit") => ({ bestanden: false, funde: [{ datei: "scripts/x.ts", zeile: 47, schwere: "hoch" as const, text: "Fehlt GH_TOKEN, liefert mergeVon null", art }] });
  assert.equal(hatRisiko(fund("codefehler")), false);
  assert.equal(hatRisiko(fund("sicherheit")), true);
  assert.equal(hatRisiko({ bestanden: false, funde: [{ datei: "a.ts", zeile: 1, schwere: "hoch" as const, text: "Secret im Log" }] }), true);
});

test("SIN-921: Probe je Issue in docs/abnahme/<name>.yml zählt", () => {
  assert.equal(hatProbe(["docs/abnahme/platz-live-beleg.yml"]), true);
  assert.equal(hatProbe(["docs/abnahme.yml"]), true);
  assert.equal(hatProbe(["docs/abnahme/unter/x.yml", "docs/abnahme-alt.yml"]), false);
});
