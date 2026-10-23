import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import { ROUTEN } from "../../../e2e/routes";

const seiten = (readdirSync("src/app", { recursive: true, encoding: "utf8" }) as string[])
  .map((p) => p.split("\\").join("/"))
  .filter((p) => p === "page.tsx" || p.endsWith("/page.tsx"))
  .sort();

test("jede page.tsx unter src/app steht in e2e/routes.ts", () => {
  const fehlend = seiten.filter((s) => !ROUTEN.some((r) => r.datei === s));
  assert.deepEqual(fehlend, [], `Nicht in e2e/routes.ts: ${fehlend.join(", ")}`);
});

test("routes.ts nennt keine Seite, die es nicht gibt", () => {
  assert.deepEqual(ROUTEN.map((r) => r.datei).filter((d) => !seiten.includes(d)), []);
});

test("Adressen passen zu den Dateien, Ausnahmen sind begründet", () => {
  for (const r of ROUTEN) {
    const ordner = r.datei.replace(/\/?page\.tsx$/, "").replace(/\[[^/]+\]/g, "[^/]+");
    assert.match(r.pfad, new RegExp(`^/${ordner}$`), r.datei);
    assert.ok(r.ausnahme === undefined || r.ausnahme.length >= 20, `${r.datei}: Ausnahme ohne Begründung`);
  }
});
