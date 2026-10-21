import assert from "node:assert/strict";
import { test } from "node:test";
import { issueAusloeser, kommentar, pruefeDiagnose, vorbefund, workflowAusloeser, type Diagnose, type Ereignis } from "./diagnose";

const jetzt = new Date("2026-10-21T12:00:00Z");
const w = (issue: string, h: number, status: string, pr: number | null = null, url?: string): Ereignis => ({
  created_at: new Date(jetzt.getTime() - h * 3_600_000).toISOString(),
  step: "worker",
  status,
  issue,
  pr,
  run_url: url,
});

// Fixtures: Ausgaben des Agenten, wie sie der Vertrag (docs/schemas/diagnose.json) verlangt. Geprüft wird der Vertrag, nicht das Urteil des Modells.
const erledigt: Diagnose = {
  rolle: "diagnose",
  ziel: "SIN-900",
  zeitpunkt: "2026-10-21T06:00:00Z",
  ursache: "Beide Läufe endeten ohne Diff, weil die Änderung schon auf main liegt (PR #321).",
  beleg: ["PR #321 gemergt: https://github.com/siinanXD/Leitstand/pull/321", "Probe leitstand-snapshot grün", "npm test auf main grün"],
  art: "erledigt",
  vorschlag: "SIN-900 auf Done setzen, Belege oben.",
};
const abnahmeRot: Diagnose = {
  rolle: "diagnose",
  ziel: "workflow:abnahme",
  zeitpunkt: "2026-10-21T06:00:00Z",
  ursache: "Der Insert in loop_events schlägt mit HTTP 401 fehl (SUPABASE_SERVICE_ROLE_KEY im Repo abgelaufen), deshalb ist die Tabelle leer und die Proben bleiben rot.",
  beleg: ["https://github.com/siinanXD/Leitstand/actions/runs/1: 'loop_event nicht geschrieben: 401'", "GET loop_events?step=eq.abnahme → 0 Zeilen"],
  art: "sinan",
  vorschlag: "Sinan erneuert das Secret SUPABASE_SERVICE_ROLE_KEY.",
};

test("Test: Fixture „2× kein Diff, alle Haken belegt“ → `art: erledigt` mit Belegen", () => {
  const ziele = issueAusloeser([w("SIN-900", 5, "start"), w("SIN-900", 4.9, "ok", null, "u1"), w("SIN-900", 3, "start"), w("SIN-900", 2.9, "ok", null, "u2")], jetzt);
  assert.deepEqual(ziele, [{ schluessel: "SIN-900", art: "issue", issue: "SIN-900", beleg: ["u1", "u2"] }]);
  const v = vorbefund(ziele[0], [], "## Fertig, wenn\n\n- [x] Test A\n- [x] Probe B\n", jetzt);
  assert.equal(v?.art, "erledigt");
  assert.deepEqual(v?.beleg, ["2 von 2 Haken erledigt", "u1", "u2"]);
  assert.equal(vorbefund(ziele[0], [], "- [x] Test A\n- [ ] Probe B", jetzt), null, "offener Haken: kein erledigt");
  assert.deepEqual(pruefeDiagnose({ ...erledigt, art: v!.art, beleg: v!.beleg, ursache: v!.ursache }), []);
  assert.deepEqual(pruefeDiagnose(erledigt), []);
  assert.match(kommentar(erledigt), /Diagnose \(erledigt\).*SIN-900[\s\S]*PR #321[\s\S]*Done vorschlagen/);
});

test("Test: Fixture „Abnahme rot, loop_events leer“ → Ursache nennt den Insert-Fehler", () => {
  const z = workflowAusloeser("abnahme", "https://github.com/x/actions/runs/1", [], jetzt)!;
  const v = vorbefund(z, [w("SIN-1", 1, "ok")], null, jetzt);
  assert.match(v?.ursache ?? "", /Insert in loop_events scheitert/);
  assert.ok(v?.beleg.includes("loop_events step=abnahme in 24 h: 0 Zeilen"));
  const mitZeile = vorbefund(z, [{ ...w("SIN-1", 1, "ok"), step: "abnahme" }], null, jetzt);
  assert.equal(mitZeile, null, "gespeicherte Zeile: kein Insert-Fehler");
  assert.deepEqual(pruefeDiagnose(abnahmeRot), []);
  assert.match(abnahmeRot.ursache, /Insert in loop_events.*401/);
  assert.match(kommentar(abnahmeRot), /\*\*Ursache:\*\* Der Insert in loop_events/);
});

test("erledigt mit nur einem Beleg, unbekannte Art und fehlende Felder sind ungültig", () => {
  assert.deepEqual(pruefeDiagnose({ ...erledigt, beleg: ["nur einer"] }), ["$.beleg: art erledigt braucht mindestens 2 Belege"]);
  assert.ok(pruefeDiagnose({ ...erledigt, art: "done" }).length > 0);
  assert.ok(pruefeDiagnose({ ...erledigt, beleg: [] }).length > 0);
  assert.ok(pruefeDiagnose({ rolle: "diagnose" }).length > 0);
});

test("Auslöser: ein Lauf, ein späterer PR oder laufender Start reichen nicht", () => {
  assert.deepEqual(issueAusloeser([w("SIN-1", 3, "ok")], jetzt), []);
  assert.deepEqual(issueAusloeser([w("SIN-2", 5, "ok"), w("SIN-2", 4, "fehler"), w("SIN-2", 3, "ok", 12)], jetzt), []);
  assert.deepEqual(issueAusloeser([w("SIN-3", 5, "ok"), w("SIN-3", 2, "start")], jetzt), []);
});

test("Sperre: höchstens eine Diagnose je Issue/Workflow in 6 h", () => {
  const lauefe = [w("SIN-4", 9, "ok"), w("SIN-4", 8, "fehler")];
  const diag = (h: number, issue: string | null, grund?: string): Ereignis => ({ ...w(issue ?? "x", h, "ok"), step: "diagnose", issue, grund });
  assert.equal(issueAusloeser([...lauefe, diag(5, "SIN-4")], jetzt).length, 0);
  assert.equal(issueAusloeser([...lauefe, diag(7, "SIN-4")], jetzt).length, 1);
  assert.equal(workflowAusloeser("abnahme", "u", [diag(1, null, "workflow:abnahme: art=sinan")], jetzt), null);
  assert.deepEqual(workflowAusloeser("abnahme", "u", [diag(7, null, "workflow:abnahme: art=sinan")], jetzt), { schluessel: "workflow:abnahme", art: "workflow", beleg: ["u"] });
});
