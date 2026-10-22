import assert from "node:assert/strict";
import { test } from "node:test";
import { aktionsStatus, istAgent } from "./aktion";

const AGENT = "agent@example.invalid";

test("Agent-Konto: jede Aktion 403, Lesen erlaubt", () => {
  for (const m of ["POST", "PUT", "PATCH", "DELETE", "post"]) assert.equal(aktionsStatus(AGENT, m, AGENT), 403, m);
  for (const m of ["GET", "HEAD", "OPTIONS"]) assert.equal(aktionsStatus(AGENT, m, AGENT), 200, m);
});

test("andere Nutzer und fehlende Konfiguration bleiben unberührt", () => {
  assert.equal(aktionsStatus("sinan@example.org", "POST", AGENT), 200);
  assert.equal(aktionsStatus(AGENT, "POST", undefined), 200);
  assert.equal(aktionsStatus(AGENT, "POST", ""), 200);
});

test("istAgent ignoriert Groß-/Kleinschreibung und Leerraum", () => {
  assert.equal(istAgent(" Agent@Example.invalid ", AGENT), true);
  assert.equal(istAgent("x@example.org", AGENT), false);
});

test("Sitzungs-Marker sperrt auch ohne AGENT_TESTNUTZER_EMAIL (kein fail-open)", () => {
  assert.equal(aktionsStatus(AGENT, "POST", undefined, true), 403);
  assert.equal(aktionsStatus("sinan@example.org", "DELETE", "", true), 403);
  assert.equal(aktionsStatus(AGENT, "GET", undefined, true), 200);
  assert.equal(aktionsStatus("sinan@example.org", "POST", AGENT, false), 200);
});
