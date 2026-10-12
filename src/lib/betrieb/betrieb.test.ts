import assert from "node:assert/strict";
import { test } from "node:test";
import type { Bericht } from "../lernen/lernen";
import { betriebEreignis, budgetAusEnv, kostenHeute, pruefeBudget, tagesbericht } from "./betrieb";

const jetzt = new Date("2026-10-12T06:00:00Z");
const bericht = (o: Partial<Bericht> = {}): Bericht => ({ schema: "lernen-bericht/1", erstellt: jetzt.toISOString(), zeitraumStunden: 24, ereignisse: 10, fehler: [], kosten: [], skillVorschlaege: [], vorschlaege: [], ...o });

test("Budget: Standard, Env und ungültige Werte", () => {
  assert.deepEqual(budgetAusEnv({}), { lauf: 0.25, tag: 1 });
  assert.deepEqual(budgetAusEnv({ BETRIEB_MAX_USD_LAUF: "0.5", BETRIEB_MAX_USD_TAG: "x" }), { lauf: 0.5, tag: 1 });
});

test("Budget: Lauf- und Tagesgrenze", () => {
  const b = { lauf: 0.25, tag: 1 };
  assert.equal(pruefeBudget(0.1, 0, b).erlaubt, true);
  assert.equal(pruefeBudget(0.3, 0, b).erlaubt, false);
  const voll = pruefeBudget(0.2, 0.9, b);
  assert.equal(voll.erlaubt, false);
  assert.match(voll.grund ?? "", /Tagesgrenze/);
});

test("kostenHeute zählt nur Agent betrieb und heutigen Tag", () => {
  const e = [
    { agent: "betrieb", cost: 0.1, created_at: "2026-10-12T01:00:00Z" },
    { agent: "betrieb", cost: 0.2, created_at: "2026-10-11T23:00:00Z" },
    { agent: "worker", cost: 5, created_at: "2026-10-12T02:00:00Z" },
    { agent: "betrieb", cost: null, created_at: "2026-10-12T03:00:00Z" },
  ];
  assert.equal(kostenHeute(e, jetzt), 0.1);
});

test("Ereignis: Agent betrieb, Kosten gerundet", () => {
  const e = betriebEreignis("tagesbericht", "ok", 0.123456, { id: "1" });
  assert.equal(e.agent, "betrieb");
  assert.equal(e.cost, 0.1235);
  assert.equal(e.run_url, null);
});

test("Tagesbericht: ohne Bericht keine erfundenen Zahlen, mit Fehlern braucht dich", () => {
  assert.equal(tagesbericht(null, 0, jetzt).brauchtDich, false);
  assert.match(tagesbericht(null, 0, jetzt).titel, /keine Daten/);
  const ruhig = tagesbericht(bericht(), 0.05, jetzt);
  assert.equal(ruhig.brauchtDich, false);
  const laut = tagesbericht(bericht({ fehler: [{ thema: "build rot", anzahl: 2, text: "", quellen: [] }] }), 0.05, jetzt);
  assert.equal(laut.brauchtDich, true);
  assert.ok(laut.zeilen.includes("2× build rot"));
});
