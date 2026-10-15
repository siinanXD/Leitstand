import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import { rollenStillstandAus } from "../push/ausloeser";
import { pruefeRollen, ROLLEN } from "./rollen";

const jetzt = Date.parse("2026-10-15T20:00:00Z");
const vor = (h: number) => new Date(jetzt - h * 3_600_000).toISOString();

test("SIN-704: CEO 20 h alt bei „taeglich“ gibt keinen Alarm", () => {
  const b = pruefeRollen([{ step: "ceo", created_at: vor(20) }], jetzt).find((x) => x.rolle === "ceo");
  assert.equal(b?.urteil, "ok");
});

test("SIN-704: Planer 7 h alt bei „ereignis“ ist nur ein Hinweis, kein Alarm", () => {
  const befunde = pruefeRollen([{ step: "planer", created_at: vor(7) }], jetzt);
  assert.equal(befunde.find((x) => x.rolle === "planer")?.urteil, "hinweis");
  assert.deepEqual(rollenStillstandAus(befunde, "Leitstand", jetzt), []);
});

test("Alter Name zählt: Vorarbeiter-Ereignis hält den Planer am Leben", () => {
  const b = pruefeRollen([{ step: null, agent: "vorarbeiter", created_at: vor(1) }], jetzt).find((x) => x.rolle === "planer");
  assert.equal(b?.urteil, "ok");
});

test("Periodische Rolle über ihrer Grenze löst Alarm aus; „aus“ wird nicht geprüft", () => {
  const befunde = pruefeRollen([{ step: "waechter", created_at: vor(5) }], jetzt);
  assert.equal(befunde.find((x) => x.rolle === "waechter")?.urteil, "alarm");
  assert.equal(rollenStillstandAus(befunde, "Leitstand", jetzt).length, 1);
  assert.equal(befunde.some((x) => x.rolle === "marketing"), false);
});

test("rollen.json nennt jeden Workflow unter .github/workflows", () => {
  const namen = readdirSync(".github/workflows").map((f) => f.replace(/\.yml$/, ""));
  for (const n of namen) assert.ok(ROLLEN.some((r) => r.schritt === n), `${n} fehlt in rollen.json`);
});
