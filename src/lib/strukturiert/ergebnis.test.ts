import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { AntwortFehler } from "./strukturiert";
import { rollenErgebnis, schreibeErgebnis } from "./ergebnis";

const tsx = resolve("node_modules/tsx/dist/loader.mjs");
const schemaSkript = resolve("scripts/autonomy/schema.ts");
const gemeinsam = { zusammenfassung: "Z", naechster_schritt: "N" };
const pruefe = (rolle: string, datei: string) => spawnSync(process.execPath, ["--import", tsx, schemaSkript, rolle, datei], { encoding: "utf8", timeout: 30000 });

test("Fixture je Rolle (ceo, planer, research) besteht scripts/autonomy/schema.ts", () => {
  for (const rolle of ["ceo", "planer", "research"]) {
    const r = pruefe(rolle, `docs/schemas/fixtures/${rolle}.json`);
    assert.equal(r.status, 0, `${rolle}: ${r.stderr}`);
  }
});

test("schreibeErgebnis schreibt Gültiges und lehnt Verstöße ab, ohne eine Datei anzulegen", () => {
  const dir = mkdtempSync(join(tmpdir(), "leitstand-ergebnis-"));
  try {
    const datei = join(dir, "x", "ceo.json");
    const gut = rollenErgebnis("ceo", "SIN-542", gemeinsam, { entscheidungen: [{ produkt: "leitstand", entscheidung: "warten", begruendung: "B" }] });
    assert.equal(schreibeErgebnis("ceo", gut, datei), datei);
    assert.equal(pruefe("ceo", datei).status, 0);
    assert.equal(JSON.parse(readFileSync(datei, "utf8")).rolle, "ceo");

    const schlecht = join(dir, "schlecht.json");
    const falsch = rollenErgebnis("ceo", "SIN-542", gemeinsam, { entscheidungen: [{ produkt: "leitstand", entscheidung: "vielleicht", begruendung: "B" }] });
    assert.throws(() => schreibeErgebnis("ceo", falsch, schlecht), (e: Error) => e instanceof AntwortFehler && /entscheidung/.test(e.message));
    assert.throws(() => readFileSync(schlecht), /ENOENT/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CEO-Skript schreibt im Trockenlauf ein Ergebnis, das schema.ts annimmt", () => {
  const dir = mkdtempSync(join(tmpdir(), "leitstand-ceo-"));
  try {
    const datei = join(dir, "ceo.json");
    const lauf = spawnSync(process.execPath, ["--import", tsx, resolve("scripts/ceo/ceo.ts")], {
      encoding: "utf8",
      timeout: 60000,
      env: { ...process.env, DRY_RUN: "1", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", GH_TOKEN: "", ERGEBNIS_DATEI: datei },
    });
    assert.equal(lauf.status, 0, lauf.stderr);
    const r = pruefe("ceo", datei);
    assert.equal(r.status, 0, r.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Workflows prüfen das Ergebnis nach dem Lauf mit schema.ts (Verstoß → rot)", () => {
  for (const [wf, rolle] of [["ceo", "ceo"], ["planer", "planer"]]) {
    const yml = readFileSync(`.github/workflows/${wf}.yml`, "utf8");
    assert.match(yml, new RegExp(`ERGEBNIS_DATEI: /tmp/${rolle}-ergebnis\\.json`));
    assert.match(yml, new RegExp(`run: npx tsx scripts/autonomy/schema\\.ts ${rolle} /tmp/${rolle}-ergebnis\\.json`));
  }
});
