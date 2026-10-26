import assert from "node:assert/strict";
import { test } from "node:test";
import { brauchtCodexNachlauf } from "./codex-nachlauf";
import { codexAntwortHash, type NativeReview } from "./codex";
const head = "a".repeat(40);
const frage = [{ head, basis: "b".repeat(40), auftrag: "c".repeat(16), erstellt: "2026-10-26T00:00:00Z" }];
const bot = { login: "chatgpt-codex-connector[bot]", type: "Bot" };
const nachricht: NativeReview = { id: 1, user: bot, submitted_at: "2026-10-26T00:00:05Z", commit_id: head, body: "Antwort" };
test("Nur neue authentische Antwortversionen auf einen aktuellen Request lösen Nachlauf aus", () => {
  assert.equal(brauchtCodexNachlauf(head, frage, codexAntwortHash([]), [nachricht]), true);
  assert.equal(brauchtCodexNachlauf(head, frage, codexAntwortHash([nachricht]), [nachricht]), false);
  assert.equal(brauchtCodexNachlauf(head, [], "", [nachricht]), false);
  const fremd = { ...nachricht, user: { login: "fremd", type: "User" } };
  assert.equal(brauchtCodexNachlauf(head, frage, codexAntwortHash([]), [fremd]), false);
});
test("Antwort zwischen Snapshot und Veröffentlichung wird nicht durch Kommentarzeit verschluckt", () => {
  const gelesen = codexAntwortHash([]); // Snapshot 00:00:00; Antwort 00:00:05; Veröffentlichung 00:00:10.
  assert.equal(brauchtCodexNachlauf(head, frage, gelesen, [nachricht]), true);
});
test("Aktualisierung in derselben Sekunde und geänderte Review-Zustände werden erneut gelesen", () => {
  const gelesen = codexAntwortHash([nachricht]);
  assert.equal(brauchtCodexNachlauf(head, frage, gelesen, [{ ...nachricht, body: "Neue Antwort" }]), true);
  assert.equal(brauchtCodexNachlauf(head, frage, gelesen, [{ ...nachricht, state: "DISMISSED" }]), true);
  assert.equal(codexAntwortHash([nachricht]), codexAntwortHash([{ ...nachricht }]));
});
