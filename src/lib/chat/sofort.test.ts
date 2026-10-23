import assert from "node:assert/strict";
import { test } from "node:test";
import type { Quelle } from "../uebersicht";
import { sofortAntwort, SPAETER } from "./sofort";

const q = {
  events: [],
  snapshot: [{ project: "leitstand", issue: "SIN-865", status: "running", labels: ["sinan"], pr: null, open_prs: [{ repo: null, nummer: 433, titel: "t", url: null, labels: [], entwurf: false, ciGruen: true, grund: null }] }],
  aufgaben: [{ issue: "SIN-865", titel: "Chatbubble", projekt: "leitstand", status: "laeuft", gestartet: null, fertig: null, labels: ["claude"], haken: null }],
} as unknown as Quelle;

test("Test: Sofort-Weg beantwortet eine Statusfrage mit SIN-Nummer aus loop_snapshot und leitstand_aufgaben ohne Modellaufruf", () => {
  assert.equal(sofortAntwort("Wie ist der Stand von sin-865?", q), "SIN-865 „Chatbubble“: läuft gerade, Claude arbeitet daran, offener PR #433, braucht Sinan.");
});

test("unbekannte Nummer wird gesagt, nichts erfunden", () => {
  assert.equal(sofortAntwort("SIN-1", q), "SIN-1: nicht bekannt.");
});

test("Statusfrage ohne Nummer nennt die laufenden Aufgaben; ohne Daten niemand", () => {
  assert.match(sofortAntwort("Was läuft gerade?", q)!, /SIN-865 „Chatbubble“/);
  assert.match(sofortAntwort("status", { events: [], snapshot: [] })!, /niemand/);
});

test("andere Fragen gehen weiter (null), Standardtext bleibt „Ich schaue nach.“", () => {
  assert.equal(sofortAntwort("Plane bitte die Woche", q), null);
  assert.equal(SPAETER, "Ich schaue nach.");
});
