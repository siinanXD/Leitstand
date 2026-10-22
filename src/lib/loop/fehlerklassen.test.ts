import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { ERLAUBT, pruefeLauf } from "./lauf";

// Fehlerklassen-Tests (SIN-967): wiederkehrende Fehler als feste Prüfung statt nur als Zeile in LEHREN.md.
const ORDNER = new URL("../../../.github/workflows/", import.meta.url);
const workflows = new Map(readdirSync(ORDNER).filter((f) => f.endsWith(".yml")).map((f) => [f, readFileSync(new URL(f, ORDNER), "utf8")]));
/** Standard des Eingabefelds `dry_run` bei workflow_dispatch, sonst null. */
const trockenStandard = (yml: string) => yml.match(/\n\s+dry_run:[\s\S]*?default: (\w+)/)?.[1] ?? null;

test("Test: Automatik startet keinen Workflow ungewollt als Trockenlauf (gh workflow run, Takt-Workflows, Lauf-Spur)", () => {
  // 1. Workflows, die andere per `gh workflow run` starten, übergeben dry_run, wenn das Ziel standardmäßig trocken läuft.
  for (const [datei, yml] of workflows) {
    for (const m of yml.matchAll(/gh workflow run ([\w.-]+\.yml)([^\n]*)/g)) {
      const ziel = workflows.get(m[1]);
      if (ziel && trockenStandard(ziel) === "true") assert.match(m[2], /dry_run=/, `${datei} startet ${m[1]} ohne dry_run (Standard true)`);
    }
  }
  // 2. Der externe Takt startet dispatch.yml und waechter.yml ohne Eingaben (SIN-965).
  for (const f of ["dispatch.yml", "waechter.yml"]) assert.equal(trockenStandard(workflows.get(f) ?? ""), "false", f);
  // 3. Die Lauf-Spur verlangt dry_run für Leitstand-Workflows, die standardmäßig trocken laufen.
  for (const r of ERLAUBT.filter((x) => x.repo === "siinanXD/Leitstand")) {
    if (trockenStandard(workflows.get(r.workflow) ?? "") !== "true") continue;
    assert.match(String(pruefeLauf({ repo: r.repo, workflow: r.workflow, inputs: {} })), /dry_run fehlt/, r.workflow);
  }
});

test("CI-Proben in abnahme.yml hängen nicht am Head-SHA (SIN-967)", () => {
  const proben = readFileSync(new URL("../../../docs/abnahme.yml", import.meta.url), "utf8");
  assert.doesNotMatch(proben, /build\.yml\/runs\?[^\n]*head_sha=/, "head_sha macht die Probe direkt nach einem Merge rot");
});

test("Probe-Text der drei CI-Proben passt auf die echte API-Antwort (geprüft gegen `build.yml`-Runs von `main`)", () => {
  // Auszug der echten Antwort (22.10.2026). GitHub rückt JSON nur für curl ein; fetch in scripts/abnahme bekommt es kompakt.
  // Der Probe-Text muss deshalb auf beide Formate passen (SIN-967).
  const daten = JSON.parse(readFileSync(new URL("./fixtures/build-runs-main.json", import.meta.url), "utf8"));
  const formate = [JSON.stringify(daten), JSON.stringify(daten, null, 2)];
  const proben = readFileSync(new URL("../../../docs/abnahme.yml", import.meta.url), "utf8");
  const ci = [...proben.matchAll(/url: [^\n]*build\.yml\/runs\?[^\n]*\n\s+enthaelt: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(ci.length, 3);
  for (const text of ci) for (const antwort of formate) assert.ok(antwort.includes(text), `„${text}“ fehlt in der Antwort`);
});
