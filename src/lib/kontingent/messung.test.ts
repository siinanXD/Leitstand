import assert from "node:assert/strict";
import { test } from "node:test";
import { apiGuthaben, nichtMessbarText, quotaText, vercelTeam, VERCEL_KEY } from "./messung";
import { parseQuotas, type Quota } from "../uebersicht";
import { parseGuthaben, parseNichtMessbar } from "../kosten/guthaben";

const jetzt = new Date("2026-10-23T12:00:00Z");

test("Vercel: Zählung summiert mehrere Projekte (Fixture mit 2 Projekten)", () => {
  const t = jetzt.getTime();
  const q = vercelTeam(
    [
      { uid: "a1", projectId: "p1", created: t - 1000 },
      { uid: "a2", projectId: "p1", created: t - 2000 },
      { uid: "b1", projectId: "p2", created: t - 3000 },
      { uid: "b1", projectId: "p2", created: t - 3000 },
      { uid: "alt", projectId: "p2", created: t - 25 * 3_600_000 },
    ],
    jetzt,
  );
  assert.equal(q.used, 3);
  assert.equal(q.key, VERCEL_KEY);
  assert.equal(q.quelle, "team");
  assert.equal(q.limit, 100);
  assert.deepEqual(parseQuotas([q])[0], q);
});

test("API-Guthaben gerechnet = Einzahlung − Verbrauch; ohne Admin-Key nicht messbar, kein Wert", () => {
  const g = apiGuthaben("OpenAI", 50, 12.5, true, jetzt);
  assert.ok(g.art === "wert" && g.wert === 37.5 && g.gesamt === 50 && g.quelle === "gerechnet");
  const leer = apiGuthaben("OpenAI", 50, 80, true, jetzt);
  assert.ok(leer.art === "wert" && leer.wert === 0);
  const n = apiGuthaben("OpenAI", 50, null, false, jetzt);
  assert.equal(n.art, "nicht-messbar");
  assert.ok(!("wert" in n));
  assert.equal(n.art === "nicht-messbar" && nichtMessbarText(n), "OpenAI: nicht messbar: Admin-Key fehlt");
  assert.ok(g.art === "wert" && g.einheit === "$");
  const ohne = apiGuthaben("OpenAI", 0, 5, true, jetzt);
  assert.ok(ohne.art === "nicht-messbar" && ohne.grund === "Einzahlung nicht eingetragen");
});

test("nicht messbar wird gelesen, ohne dass parseGuthaben einen Wert erfindet", () => {
  const n = apiGuthaben("OpenAI", 50, null, false, jetzt);
  assert.deepEqual(parseGuthaben([n]), []);
  assert.deepEqual(parseNichtMessbar(JSON.stringify([n])), [{ dienst: "OpenAI", grund: "Admin-Key fehlt" }]);
});

test("Abo-Zeilen tragen quelle schaetzung und werden als Schätzung beschriftet", () => {
  const q: Quota = { name: "ChatGPT-Abo", used: 40, limit: 100, schaetzung: true, quelle: "schaetzung" };
  assert.equal(q.quelle, "schaetzung");
  assert.equal(q.schaetzung, true);
  assert.match(quotaText(q), /\(Schätzung\)/);
  assert.match(quotaText(vercelTeam([], jetzt)), /ganzes Team/);
  assert.equal(parseQuotas([q])[0].quelle, "schaetzung");
});
