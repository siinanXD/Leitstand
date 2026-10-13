import assert from "node:assert/strict";
import { test } from "node:test";
import { erinnere, merke, vergiss } from "./stand-speicher";

/** Minimaler Speicher; `kaputt` wirft bei jedem Zugriff wie ein gesperrter Browser-Speicher. */
const speicher = (kaputt = false) => {
  const m = new Map<string, string>();
  const pruefe = () => {
    if (kaputt) throw new Error("gesperrt");
  };
  return {
    getItem: (k: string) => (pruefe(), m.get(k) ?? null),
    setItem: (k: string, v: string) => (pruefe(), void m.set(k, v)),
    removeItem: (k: string) => (pruefe(), void m.delete(k)),
  } as unknown as Storage;
};

const stand = { quelle: { events: [], snapshot: [] }, chef: null, zeit: "2026-10-13T10:00:00.000Z" };

test("Stand wird gemerkt, gelesen und beim Abmelden vergessen", () => {
  const s = speicher();
  assert.equal(erinnere(s), null);
  merke(stand, s);
  assert.deepEqual(erinnere(s), stand);
  vergiss(s);
  assert.equal(erinnere(s), null);
});

test("Gesperrter Speicher oder Unlesbares werfen nie", () => {
  const k = speicher(true);
  assert.doesNotThrow(() => merke(stand, k));
  assert.equal(erinnere(k), null);
  assert.doesNotThrow(() => vergiss(k));
  const s = speicher();
  s.setItem("leitstand-stand-v1", "{kaputt");
  assert.equal(erinnere(s), null);
  s.setItem("leitstand-stand-v1", JSON.stringify({ quelle: { events: 1 }, zeit: "x" }));
  assert.equal(erinnere(s), null);
});
