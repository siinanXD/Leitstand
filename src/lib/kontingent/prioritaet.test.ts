import assert from "node:assert/strict";
import { test } from "node:test";
import { groesse, hoechsteStufe, knappSatz, passend, restProzent, stufe } from "./prioritaet";

test("stufe: Bug zuerst, Idee zuletzt, sonst Produkt", () => {
  assert.equal(stufe(["claude", "Bug"]), 1);
  assert.equal(stufe(["lernapp"]), 2);
  assert.equal(stufe(["claude"]), 3);
  assert.equal(stufe(["infra"]), 4);
  assert.equal(stufe(["idee"]), 5);
});

test("hoechsteStufe: Puffer und knapp", () => {
  assert.equal(hoechsteStufe(null), 5);
  assert.equal(hoechsteStufe(80), 5);
  assert.equal(hoechsteStufe(30), 2);
  assert.equal(hoechsteStufe(14), 0);
});

test("restProzent aus Claude-Quote", () => {
  assert.equal(restProzent([{ name: "Claude 5h", used: 70, limit: 100 }]), 30);
  assert.equal(restProzent([{ name: "OpenAI", used: 1, limit: 2 }]), null);
});

test("passend: knapp lässt nur Stufe 1–2, pausiert nichts, Schätzung begrenzt", () => {
  const bug = { labels: ["bug"] };
  const produkt = { labels: ["claude"] };
  assert.deepEqual(passend([bug, produkt], 30), [bug]);
  assert.deepEqual(passend([bug, produkt], 10), []);
  assert.deepEqual(passend([bug, produkt], null), [bug, produkt]);
  // Rest 22 %: 7 Punkte über dem Puffer, ein mittleres Issue (5) passt, das zweite nicht
  assert.equal(passend([{ labels: ["bug"] }, { labels: ["bug"] }], 22).length, 1);
  assert.equal(groesse(["klein"]), "klein");
});

test("knappSatz nur bei knappem Kontingent", () => {
  assert.equal(knappSatz(80), null);
  assert.match(knappSatz(30)!, /nur noch Stufe 1–2/);
  assert.match(knappSatz(5)!, /pausiert/);
});
