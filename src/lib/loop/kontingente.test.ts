import assert from "node:assert/strict";
import { test } from "node:test";
import statuses from "./fixtures/commit-status-vercel.json";
import { aktiveSperren, braucht, ohneGesperrte } from "./kontingente";

const mit = (pfade?: string[]) => ({ identifier: "SIN-1", description: pfade ? `<!-- worker-pfade: ${JSON.stringify(pfade)} -->` : null });
const sperren = aktiveSperren(statuses, new Date("2026-10-23T12:00:00Z"));

test("Vercel-Sperre aus Commit-Status: gesperrt bis Zeitpunkt + 24 h", () => {
  assert.deepEqual(sperren.map((s) => [s.id, s.bis.toISOString()]), [["vercel-deploy", "2026-10-24T08:00:00.000Z"]]);
});

test("Sperre läuft nach 24 h ab", () => {
  assert.equal(aktiveSperren(statuses, new Date("2026-10-24T07:59:59Z")).length, 1);
  assert.equal(aktiveSperren(statuses, new Date("2026-10-24T08:00:00Z")).length, 0);
});

test("ohne Treffer im Status keine Sperre", () => {
  assert.deepEqual(aktiveSperren(statuses.filter((s) => !/limited/.test(s.description)), new Date("2026-10-23T12:00:00Z")), []);
});

test("Vercel-Sperre: src/app wird übersprungen, scripts/docs starten", () => {
  const ui = { ...mit(["src/app/ablauf", "src/lib/ablauf"]), identifier: "SIN-UI" };
  const css = { ...mit(["src/lib/x.ts", "styles/globals.css"]), identifier: "SIN-CSS" };
  const nurSkript = { ...mit(["scripts/loop/loop.ts", "docs/abnahme.yml"]), identifier: "SIN-S" };
  const { frei, uebersprungen } = ohneGesperrte([ui, css, nurSkript], sperren);
  assert.deepEqual(frei.map((i) => i.identifier), ["SIN-S"]);
  assert.deepEqual(uebersprungen.map((u) => [u.issue.identifier, u.grund]), [["SIN-UI", "kontingent:vercel-deploy"], ["SIN-CSS", "kontingent:vercel-deploy"]]);
});

test("Issue ohne worker-pfade wird bei aktiver Sperre übersprungen, ohne Sperre nicht", () => {
  assert.equal(ohneGesperrte([mit()], sperren).frei.length, 0);
  assert.equal(ohneGesperrte([mit()], []).frei.length, 1);
});

test("Muster: Wurzeldateien und Verzeichnisgrenzen", () => {
  assert.ok(braucht(mit(["next.config.ts"]), "vercel-deploy"));
  assert.ok(braucht(mit(["package-lock.json"]), "vercel-deploy"));
  assert.ok(braucht(mit(["public/icon.png"]), "vercel-deploy"));
  assert.ok(!braucht(mit(["src/application/x.ts"]), "vercel-deploy"));
});
