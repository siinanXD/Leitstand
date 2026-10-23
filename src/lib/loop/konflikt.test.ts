import assert from "node:assert/strict";
import { test } from "node:test";
import { konfliktMarker, konfliktSchritt, type KonfliktPr } from "./konflikt";

const pr = (o: Partial<KonfliktPr> = {}): KonfliktPr => ({ branch: "claude/sin-1", headSha: "aaa1", mergeableState: "dirty", labels: [], kommentare: [], ...o });

test("PR mit mergeable_state dirty und claude/-Branch bekommt genau einen Anstoß je Head-Commit", () => {
  const s = konfliktSchritt(pr());
  assert.ok("anstoss" in s);
  assert.equal(s.anstoss.versuch, 1);
  assert.ok(s.anstoss.text.startsWith("@claude "));
  assert.ok(s.anstoss.text.includes(konfliktMarker("aaa1", 1)));
  assert.deepEqual(konfliktSchritt(pr({ kommentare: [s.anstoss.text] })), { keine: "Head-Commit schon angestoßen" });
  const neu = konfliktSchritt(pr({ headSha: "bbb2", kommentare: [s.anstoss.text] }));
  assert.ok("anstoss" in neu && neu.anstoss.versuch === 2);
});

test("Nach 2 Versuchen kein dritter Anstoß, sondern needs-human", () => {
  const k = [konfliktMarker("aaa1", 1), konfliktMarker("bbb2", 2)];
  assert.deepEqual(konfliktSchritt(pr({ headSha: "ccc3", kommentare: k })), { stopp: true });
  assert.deepEqual(konfliktSchritt(pr({ headSha: "ccc3", kommentare: k, labels: ["needs-human"] })), { keine: "wartet schon auf Sinan" });
});

test("kein Anstoß ohne Konflikt oder ohne claude/-Branch", () => {
  assert.ok("keine" in konfliktSchritt(pr({ mergeableState: "clean" })));
  assert.ok("keine" in konfliktSchritt(pr({ mergeableState: null })));
  assert.ok("keine" in konfliktSchritt(pr({ branch: "feature/x" })));
  assert.ok("keine" in konfliktSchritt(pr({ branch: "codex/x" })));
});
