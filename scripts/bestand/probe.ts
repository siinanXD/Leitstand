// Unabhängige Prozessprobe: ruft den echten CLI-Einstieg ohne Netz/Secrets auf (SIN-858).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ausgabe = mkdtempSync(join(tmpdir(), "bestand-probe-"));
try {
  const run = (extra: Record<string, string>, begriff = "bestand") => execFileSync(process.execPath, ["--import", "tsx", "scripts/bestand/bestand.ts", "leitstand", "planer", "Bestandsabgleich", begriff], { encoding: "utf8", env: { ...process.env, GH_TOKEN: "", LINEAR_API_KEY: "", DRY_RUN: "1", BESTAND_FIXTURE: "", BESTAND_AUSGABE: ausgabe, ...extra } });
  run({ BESTAND_FIXTURE: "scripts/bestand/fixtures/quellen.json" });
  const text = readFileSync(join(ausgabe, "leitstand-planer.json"), "utf8");
  const bericht = JSON.parse(text);
  assert.equal(bericht.quellfehler.length, 0);
  assert.equal(bericht.offene_arbeit.length, 1);
  assert.ok(bericht.quellen.every((q: { status: string }) => q.status === "ok"));
  assert.ok(bericht.vorhandene_bausteine.some((f: { titel: string; inhalt_sha256?: string }) => /\.test\.ts$/.test(f.titel) && f.inhalt_sha256?.length === 64));
  assert.ok(!text.includes("Private fixture details"));
  assert.ok(!text.includes('"inhalt":'));
  run({ BESTAND_FIXTURE: "scripts/bestand/fixtures/quellen.json" }, "automerge");
  const infra = JSON.parse(readFileSync(join(ausgabe, "leitstand-planer.json"), "utf8"));
  for (const pfad of ["scripts/loop/risiko.mjs", ".github/workflows/automerge.yml"]) {
    const fund = infra.vorhandene_bausteine.find((f: { titel: string }) => f.titel === pfad);
    assert.equal(fund?.quelle, "code");
    assert.match(fund?.sha ?? "", /^[a-f0-9]{40}$/);
    assert.match(fund?.inhalt_sha256 ?? "", /^[a-f0-9]{64}$/);
  }
  run({});
  assert.equal(JSON.parse(readFileSync(join(ausgabe, "leitstand-planer.json"), "utf8")).quellfehler.length, 3);
  console.log("Bestandsabgleich CLI-Probe grün (Fixture und Quellenausfall; kein Live-Nachweis)");
} finally {
  rmSync(ausgabe, { recursive: true, force: true });
}
