import { test } from "node:test";
import assert from "node:assert/strict";
import { gateLaufNeustart, type GateLauf } from "./gate-lauf";

const lauf = (id: number, t: string, o: Partial<GateLauf> = {}): GateLauf => ({ id, name: "pr-gate", head_sha: "a", conclusion: "failure", created_at: `2026-10-23T${t}:00Z`, ...o });

test("Aus einer Liste von Workflow-Läufen wird der neueste fehlgeschlagene pr-gate-Lauf des geprüften Commits gewählt", () => {
  const laeufe = [lauf(1, "14:00"), lauf(3, "14:30"), lauf(2, "14:10"), lauf(9, "14:50", { head_sha: "b" }), lauf(8, "14:55", { name: "ci" }), lauf(7, "14:45", { name: "x", path: ".github/workflows/pr-gate.yml" })];
  assert.equal(gateLaufNeustart(laeufe, "a"), 7);
  assert.equal(gateLaufNeustart(laeufe.slice(0, 3), "a"), 3);
});

test("Kein Lauf oder schon grün ergibt keinen Neustart", () => {
  assert.equal(gateLaufNeustart([], "a"), null);
  assert.equal(gateLaufNeustart([lauf(1, "14:00", { head_sha: "b" })], "a"), null);
  assert.equal(gateLaufNeustart([lauf(1, "14:00"), lauf(2, "14:10", { conclusion: "success" })], "a"), null);
  assert.equal(gateLaufNeustart([lauf(1, "14:00", { conclusion: null })], "a"), null);
});
