import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { langfuseLuecken, mischeQuotas, pruefeRegister, sammle, siehtNachSchluesselAus, type Produkt } from "./produkte";

const roh = readFileSync("docs/autonomy/produkte.json", "utf8");
const register = (JSON.parse(roh) as { produkte: Produkt[] }).produkte;

test("Register nennt Lern-App, Leitstand und Stromlauf AI", () => {
  assert.deepEqual(register.map((p) => p.id), ["lernapp", "leitstand", "stromlauf-ai"]);
  assert.equal(register.find((p) => p.id === "stromlauf-ai")?.infisicalOrdner, "/stromlauf-ai");
});

test("Register enthält nur Namen, keine schlüsselähnlichen Werte", () => {
  assert.deepEqual(pruefeRegister(register), []);
  assert.ok(!siehtNachSchluesselAus("stromlauf-ai"));
  assert.ok(siehtNachSchluesselAus("sk-lf-1234567890"));
  assert.ok(siehtNachSchluesselAus("a".repeat(40)));
  assert.ok(!/\b(sk|pk)-/.test(roh));
});

test("Prüfung erkennt Wert statt Name und doppelte Kennung", () => {
  const p = { ...register[0], secrets: [{ ...register[0].secrets[0], name: "sk-lf-abc" }], langfuse: { projekt: "x".repeat(40), getrennt: true } };
  assert.equal(pruefeRegister([p, p]).length, 5);
});

test("Langfuse-Lücken: unbekannt und geteilt", () => {
  const [a, b, c] = register;
  const l = langfuseLuecken([{ ...a, langfuse: { projekt: "p1", getrennt: null } }, { ...b, langfuse: { projekt: "p1", getrennt: null } }, c]);
  assert.deepEqual(l, ["lernapp: teilt Langfuse-Projekt mit leitstand", "leitstand: teilt Langfuse-Projekt mit lernapp", "stromlauf-ai: Langfuse-Projekt unbekannt"]);
});

test("Sammler: Quota-Liste je Produkt, Summe für konto-weite Limits", () => {
  const r = sammle(register, [
    { produkt: "lernapp", name: "Deploys pro Tag", used: 40, limit: 100, konto: true },
    { produkt: "stromlauf-ai", name: "Deploys pro Tag", used: 5, limit: 100, konto: true },
    { produkt: "stromlauf-ai", name: "Langfuse-Einheiten", used: 10, limit: 50000 },
    { produkt: "unbekannt", name: "x", used: 1, limit: 2 },
    { produkt: "leitstand", name: "kaputt", used: 1, limit: 0 },
  ]);
  assert.deepEqual(Object.keys(r.je_produkt), ["lernapp", "leitstand", "stromlauf-ai"]);
  assert.equal(r.je_produkt.lernapp.length, 1);
  assert.deepEqual(r.je_produkt.leitstand, []);
  assert.deepEqual(r.je_produkt["stromlauf-ai"].map((q) => q.name), ["Deploys pro Tag", "Langfuse-Einheiten"]);
  assert.deepEqual(r.konto, [{ name: "Deploys pro Tag (alle Produkte)", used: 45, limit: 100, schaetzung: false }]);
});

test("mischeQuotas: neue Werte ersetzen gleichnamige, fremde Einträge bleiben", () => {
  const alt = [{ key: "langfuse_units_monat", name: "Langfuse: Units im Monat", value: 5 }, { name: "Deploys pro Tag", used: 1, limit: 100 }];
  const neu = [{ name: "Deploys pro Tag", used: 7, limit: 100, schaetzung: false }];
  assert.deepEqual(mischeQuotas(alt, neu), [alt[0], neu[0]]);
  assert.deepEqual(mischeQuotas(null, neu), neu);
});
