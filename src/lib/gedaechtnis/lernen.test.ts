import assert from "node:assert/strict";
import { test } from "node:test";
import { fehlerNotizen, lehrenAusDatei, lehrenAusFehlern, type FehlerZeile } from "./lernen";
import { eigenschaften, pruefe } from "./vault";

const z = (t: string, grund: string, issue: string | null = "SIN-1", status = "fehler"): FehlerZeile => ({ created_at: `2026-10-20T${t}:00Z`, project: "leitstand", issue, status, grund });
const zeilen = [z("08:00", "Sonstiges: Kein Diff"), z("09:00", "Sonstiges: Kein Diff", "SIN-2"), z("10:00", "Kontingent: Anthropic: HTTP 400 credit_balance_exhausted"), z("11:00", "Sonstiges: Kein Diff", "SIN-3"), z("12:00", "x", null, "ok"), z("12:30", "")];

test("Fehler-Notiz je Tag bündelt nach Grund und trägt alle Pflicht-Eigenschaften", () => {
  const d = fehlerNotizen(zeilen, "2026-10-01");
  assert.deepEqual(Object.keys(d), ["Fehler/2026-10-20.md"]);
  assert.match(d["Fehler/2026-10-20.md"], /- 3× Sonstiges: Kein Diff \(SIN-1, SIN-2, SIN-3\)/);
  assert.match(d["Fehler/2026-10-20.md"], /Anthropic: HTTP 400 credit_balance_exhausted/);
  assert.deepEqual(pruefe(d, new Date("2026-10-22T00:00:00Z")).filter((b) => b.art === "eigenschaft" || b.art === "unverlinkt"), []);
  assert.equal(eigenschaften(d["Fehler/2026-10-20.md"]).typ, "fehler");
});

test("Fehler-Notiz: Tage vor dem Fenster entstehen nicht", () => {
  assert.deepEqual(fehlerNotizen(zeilen, "2026-10-21"), {});
});

test("Derselbe Grund dreimal wird zur Lehre mit Link auf den Tag", () => {
  const d = lehrenAusFehlern(zeilen, new Date("2026-10-22T10:00:00Z"));
  assert.equal(Object.keys(d).length, 1);
  const text = Object.values(d)[0];
  assert.match(text, /typ: lehre/);
  assert.match(text, /\[\[Fehler\/2026-10-20\]\]/);
});

test("LEHREN.md: nur Zeilen mit Pfeil werden Lehren", () => {
  const d = lehrenAusDatei("### Kopf\n- Muster A → Maßnahme B (SIN-9)\nPlaintext\n", "siinanXD/Leitstand", new Date("2026-10-22T10:00:00Z"));
  assert.deepEqual(Object.keys(d), ["Lehren/leitstand SIN-9 Muster A.md"]);
  assert.equal(eigenschaften(Object.values(d)[0]).produkt, "leitstand");
});
