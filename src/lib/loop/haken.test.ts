import assert from "node:assert/strict";
import { test } from "node:test";
import { entscheide, hakenMarker, istTeil, kommentarText, leseBelege, leseHaken, MAX_RUNDEN, setzeHaken, wiederaufnahme, type Beleg } from "./haken";

const text = "## Fertig-Kriterien\n\n- [ ] Erstens\n- [ ] Zweitens `x`\n- [x] Drittens\n\nSonst Text";
const belegt = (t: string): Beleg => ({ text: t, belegt: true, beleg: "src/a.ts", art: "code" });

test("leseHaken liest alle Haken mit Stand", () => {
  assert.deepEqual(leseHaken(text).map((h) => h.erledigt), [false, false, true]);
  assert.deepEqual(leseHaken(null), []);
});

test("setzeHaken hakt nur belegte ab und lässt den Rest", () => {
  const neu = setzeHaken(text, ["Zweitens x"]);
  assert.match(neu, /- \[ \] Erstens/);
  assert.match(neu, /- \[x\] Zweitens `x`/);
  assert.match(neu, /Sonst Text$/);
});

test("3 Haken, PR belegt 1: bleibt offen, Kommentar nennt 2 offene", () => {
  const haken = leseHaken("- [ ] A\n- [ ] B\n- [ ] C");
  const belege = [belegt("A")];
  const e = entscheide({ haken, belege, teil: false, runde: 1 });
  assert.equal(e.status, "offen");
  assert.deepEqual(e.offen, ["B", "C"]);
  const k = kommentarText(e, belege, 1, "#5");
  assert.match(k, /- \[ \] B/);
  assert.match(k, /- \[ \] C/);
});

test("PR belegt alle 3: Done", () => {
  const haken = leseHaken("- [ ] A\n- [ ] B\n- [ ] C");
  assert.equal(entscheide({ haken, belege: ["A", "B", "C"].map(belegt), teil: false, runde: 1 }).status, "done");
});

test("bereits gesetzte Haken brauchen weiterhin einen aktuellen Beleg", () => {
  const haken = leseHaken("- [x] A\n- [ ] B");
  assert.equal(entscheide({ haken, belege: [belegt("B")], teil: false, runde: 1 }).status, "offen");
});

test("Part of: nie Done, auch wenn alles belegt ist", () => {
  const haken = leseHaken("- [ ] A");
  assert.equal(entscheide({ haken, belege: [belegt("A")], teil: true, runde: 1 }).status, "offen");
  assert.equal(istTeil("feat: x (SIN-1)", "Part of SIN-1"), true);
  assert.equal(istTeil("Part of SIN-1: x", ""), true);
  assert.equal(istTeil("feat: x (SIN-1)", "Closes #3"), false);
});

test("ohne Prüfer-Belege ist nichts belegt; ab zwei Nacharbeitsrunden Stopp", () => {
  const haken = leseHaken("- [ ] A");
  assert.equal(entscheide({ haken, belege: null, teil: false, runde: 1 }).status, "offen");
  assert.equal(MAX_RUNDEN, 2);
  assert.equal(entscheide({ haken, belege: null, teil: false, runde: 2 }).status, "needs-human");
});

test("fehlende Live-Probe wartet ohne neue Baurunde; URL allein ersetzt keine unabhängige Inhaltsprüfung", () => {
  const haken = leseHaken("- [x] Live");
  const e = entscheide({ haken, belege: [{ text: "Live", belegt: true, beleg: "Probe angelegt", art: "live" }], teil: false, runde: 9 });
  assert.equal(e.status, "wartet");
  assert.doesNotMatch(kommentarText(e, [], 9, "#5"), /<!-- haken-runde -->/);
  assert.equal(entscheide({ haken, belege: [{ text: "Live", belegt: true, beleg: "https://example.test/run/1", art: "live" }], teil: false, runde: 1 }).status, "done");
});

test("ohne Kriterien gibt es keinen automatischen Abschluss", () => {
  assert.equal(entscheide({ haken: [], belege: null, teil: false, runde: 1 }).status, "offen");
  assert.equal(entscheide({ haken: [], belege: null, teil: true, runde: 1 }).status, "offen");
});

test("leerer Beleg ist nicht belegt; alter Head oder Auftrag entwertet Marker", () => {
  const haken = leseHaken("- [ ] A");
  assert.equal(entscheide({ haken, belege: [{ text: "A", belegt: true, beleg: "  " }], teil: false, runde: 1 }).status, "offen");
  const stand = { head: "sha1", auftrag: "hash1" };
  const marker = hakenMarker([belegt("A")], stand);
  assert.deepEqual(leseBelege([marker], stand), [belegt("A")]);
  assert.equal(leseBelege([marker], { ...stand, head: "sha2" }), null);
  assert.equal(leseBelege([marker], { ...stand, auftrag: "hash2" }), null);
  assert.equal(leseBelege([hakenMarker([belegt("A")])], stand), null);
});

test("wiederaufnahme nennt offene Haken nur, wenn schon welche belegt sind", () => {
  assert.equal(wiederaufnahme("- [ ] A\n- [ ] B"), "");
  assert.match(wiederaufnahme("- [x] A\n- [ ] B"), /Nur noch offen: B/);
});

test("Marker übersteht Hin und Zurück, kaputter Marker ergibt null", () => {
  const b = [belegt("A")];
  assert.deepEqual(leseBelege(["x", `Text ${hakenMarker(b)}`]), b);
  assert.equal(leseBelege(["<!-- pruefer-haken:AAAA -->"]), null);
  assert.equal(leseBelege(["nichts"]), null);
});
