import assert from "node:assert/strict";
import { test } from "node:test";
import { mitCache } from "./cache";

const MIN = 60_000;

test("innerhalb der TTL genau ein Abruf", async () => {
  let t = 0;
  let n = 0;
  const hole = mitCache(async () => ++n, 10 * MIN, 60 * MIN, () => t);
  assert.equal(await hole(), 1);
  t = 9 * MIN;
  assert.equal(await hole(), 1);
  assert.equal(n, 1);
  t = 11 * MIN;
  assert.equal(await hole(), 2);
});

test("Fehlschlag: letzter guter Wert bis maxAlter, danach null; kein Abruf-Sturm", async () => {
  let t = 0;
  let n = 0;
  let gut = true;
  const hole = mitCache(async () => (++n, gut ? "ok" : null), 10 * MIN, 60 * MIN, () => t);
  assert.equal(await hole(), "ok");
  gut = false;
  t = 11 * MIN;
  assert.equal(await hole(), "ok");
  t = 12 * MIN;
  assert.equal(await hole(), "ok");
  assert.equal(n, 2);
  t = 70 * MIN;
  assert.equal(await hole(), null);
});

test("Ausnahme im Abruf wird zu null", async () => {
  const hole = mitCache(async () => Promise.reject(new Error("x")), MIN, MIN, () => 0);
  assert.equal(await hole(), null);
});

test("gleichzeitige Aufrufe teilen einen Abruf", async () => {
  let n = 0;
  const hole = mitCache(async () => ++n, MIN, MIN, () => 0);
  const [a, b] = await Promise.all([hole(), hole()]);
  assert.equal(a, b);
  assert.equal(n, 1);
});
