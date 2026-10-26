import assert from "node:assert/strict";
import { test } from "node:test";
import { pruefeCodexAbo } from "./codex-ablauf";
import type { Pruefstand } from "./codex";
const stand: Pruefstand = { head: "a".repeat(40), basis: "b".repeat(40), auftrag: "c".repeat(16) };
const jetzt = new Date("2026-10-26T00:02:00Z");
const lage = { stand, anforderungen: [], reviews: [], heute: 0, deckel: 15, jetzt, trocken: false };

test("Abo-Ablauf fordert einmal an; weiterer Durchlauf wartet ohne zusätzlichen Start", async () => {
  const texte: string[] = [];
  const anfordern = async (text: string) => { texte.push(text); };
  const e = await pruefeCodexAbo(lage, anfordern);
  assert.equal(e.status, "wartend"); assert.equal(texte.length, 1);
  assert.match(texte[0], /@codex review/);
  await pruefeCodexAbo({ ...lage, anforderungen: [{ ...stand, erstellt: jetzt.toISOString() }] }, anfordern);
  assert.equal(texte.length, 1);
});

test("Trockenlauf, Tagesdeckel und Timeout lösen keinen Schreibzugriff aus", async () => {
  const verboten = async () => { assert.fail("Kein Start zulässig"); };
  for (const l of [{ ...lage, trocken: true }, { ...lage, heute: 15 }, { ...lage, anforderungen: [{ ...stand, erstellt: "2026-10-25T23:00:00Z" }] }]) {
    assert.notEqual((await pruefeCodexAbo(l, verboten)).status, "fertig");
  }
});

test("Unklare Startantwort wird nicht intern wiederholt oder durch einen API-Aufruf ersetzt", async () => {
  let starts = 0;
  await assert.rejects(pruefeCodexAbo(lage, async () => { starts++; throw new Error("Antwort verloren"); }), /Antwort verloren/);
  assert.equal(starts, 1);
});

test("Abgelaufener Request darf ein später eingetroffenes gültiges Review noch auswerten", async () => {
  const ergebnis = { bestanden: true, funde: [], haken: [] };
  const body = `<!-- codex-review-state:v1 ${JSON.stringify({ code_review: { commit_sha: stand.head, status: "completed", has_any_findings: false, has_unresolved_findings: false } })} -->\n<!-- codex-kriterien:v1 ${JSON.stringify({ ...stand, ergebnis })} -->`;
  const e = await pruefeCodexAbo({ ...lage, anforderungen: [{ ...stand, erstellt: "2026-10-25T23:00:00Z" }], reviews: [{ id: 1, body, commit_id: stand.head, submitted_at: "2026-10-26T00:01:00Z", user: { login: "chatgpt-codex-connector[bot]", type: "Bot" } }] }, async () => assert.fail("kein neuer Start"));
  assert.equal(e.status, "fertig");
});
