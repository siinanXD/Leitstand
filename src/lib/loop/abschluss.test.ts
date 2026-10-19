import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { auftragStand, type Auftrag } from "./auftrag";
import { hakenMarker, type Beleg } from "./haken";

/** Tatsächlichen Merge-CLI-Einstieg prüfen, alle Netzaufrufe durch geschlossene Fixtures ersetzen. */
test("Merge-CLI: aktueller Botbeleg, Nachtrag, Worker-Fälschung, Code-Lücke und Live-Warten", () => {
  const dir = mkdtempSync(join(tmpdir(), "sin754-"));
  try {
    const preload = join(dir, "netz.mjs");
    writeFileSync(preload, `
const f = JSON.parse(process.env.FIXTURE);
globalThis.fetch = async (url, init) => {
  const ok = (v) => new Response(JSON.stringify(v), { status: 200 });
  if (url === "https://api.linear.app/graphql") {
    if (f.offline) throw new Error("Quelle offline");
    const { query, variables } = JSON.parse(init.body);
    if (query.includes("mutation")) { console.log("SCHREIBEN " + JSON.stringify(variables)); return f.statusFail && variables.s ? new Response("{}", { status: 503 }) : f.statusFalse && variables.s ? ok({ data: { issueUpdate: { success: false } } }) : ok({ data: { success: true } }); }
    if (query.includes("states {")) return ok({ data: { team: { states: { nodes: ["Done", "Todo", "In Review"].map(name => ({ name, id: name })) } } } });
    return ok({ data: { issue: { ...f.auftrag, updatedAt: "t1", comments: { nodes: f.auftrag.kommentare, pageInfo: { hasNextPage: false, endCursor: null } } } } });
  }
  if (url.endsWith("/pulls/1")) return ok({ title: "fix: Auftrag (SIN-830)", body: "Closes #2", html_url: "https://example.test/pr/1", merged: true, merge_commit_sha: "merge", head: { sha: "head" }, base: { ref: "main", repo: { full_name: "fixture/repo" } } });
  if (url.endsWith("/contents/docs/abnahme.yml?ref=merge")) return ok({ encoding: "base64", content: Buffer.from(f.liveOk === undefined ? "" : "- id: live\\n  produkt: leitstand\\n  titel: Live\\n  issue: SIN-830\\n  kriterium: Funktion\\n  art: http\\n  url: https://example.test/live\\n  enthaelt: fertig\\n").toString("base64") });
  if (url === "https://example.test/live") return new Response(f.liveOk ? "fertig" : "noch offen", { status: 200 });
  if (url.endsWith("/issues/1/comments?per_page=100")) return ok([{ user: { login: f.author }, body: f.marker }]);
  if (url.endsWith("/issues?labels=claude&state=open&per_page=100")) return ok([]);
  console.log("UNERLAUBTER_NETZAUFRUF");
  throw new Error("Nicht erlaubter Fixture-Aufruf: " + url);
};`);
    const auftrag: Auftrag = { id: "uuid", identifier: "SIN-830", title: "Auftrag", description: "- [ ] Funktion", team: { id: "team" }, kommentare: [], parent: null };
    const belege: Beleg[] = [{ text: "Funktion", belegt: true, beleg: "src/a.test.ts", art: "code" }];
    const run = (a: Auftrag, b: Beleg[], author = "github-actions[bot]", hash = auftragStand(a), extra: Record<string, unknown> = {}) => {
      const r = spawnSync(process.execPath, ["--import", "tsx", "--import", preload, resolve("scripts/loop/loop.ts"), "gemergt", "--pr", "1"], { encoding: "utf8", env: { NODE_ENV: "test", PATH: process.env.PATH, LINEAR_API_KEY: "fixture", GH_TOKEN: "fixture", GITHUB_REPOSITORY: "fixture/repo", GITHUB_RUN_ID: "fixture-run", FIXTURE: JSON.stringify({ auftrag: a, author, marker: hakenMarker(b, { head: "head", auftrag: hash }), ...extra }) } });
      assert.equal(r.status, extra.statusFail || extra.statusFalse ? 1 : 0, r.stderr + r.stdout);
      return r.stdout;
    };
    const einmal = run(auftrag, belege);
    assert.match(einmal, /"s":"Done"/);
    const statusKommentar = einmal.split("\n").filter((z) => z.startsWith("SCHREIBEN ")).map((z) => JSON.parse(z.slice("SCHREIBEN ".length))).find((v) => typeof v.b === "string").b;
    assert.doesNotMatch(run({ ...auftrag, kommentare: [{ id: "status", body: statusKommentar }] }, belege), /SCHREIBEN /, "derselbe Prüfstand darf keine zweite Runde auslösen");
    assert.match(run(auftrag, belege, "siinanXD"), /"s":"In Review"/);
    assert.match(run({ ...auftrag, kommentare: [{ id: "neu", body: "- [ ] Nachtrag" }] }, belege, "github-actions[bot]", auftragStand(auftrag)), /"s":"In Review"/);
    assert.match(run(auftrag, [{ ...belege[0], belegt: false, beleg: "Implementierung ergänzen" }]), /"s":"Todo"/);
    const wartet = run(auftrag, [{ ...belege[0], belegt: false, art: "live", beleg: "Deployment-Lauf belegen" }], undefined, undefined, { liveOk: false });
    assert.match(wartet, /"s":"In Review"/);
    assert.doesNotMatch(wartet, /"s":"Todo"/);
    assert.doesNotMatch(run({ ...auftrag, description: "Keine Kriterien" }, belege), /"s":"Done"/);
    const live = [{ ...belege[0], belegt: false, art: "live" as const }];
    assert.match(run(auftrag, live, undefined, undefined, { liveOk: false }), /"s":"In Review"/);
    assert.match(run(auftrag, live, undefined, undefined, { liveOk: true }), /"s":"Done"/, "spätere erfolgreiche Messung schließt ohne neuen Bau/Modelllauf ab");
    assert.doesNotMatch(run(auftrag, belege, undefined, undefined, { statusFail: true }), /"b":/, "fehlgeschlagener Statuswechsel darf keinen Ergebnis-Kommentar hinterlassen");
    assert.doesNotMatch(run(auftrag, belege, undefined, undefined, { statusFalse: true }), /"b":/, "success:false darf keinen Ergebnis-Kommentar hinterlassen");
    const lesen = spawnSync(process.execPath, ["--import", "tsx", "--import", preload, resolve("scripts/loop/loop.ts"), "auftrag", "--issue", "SIN-830"], { encoding: "utf8", env: { NODE_ENV: "test", PATH: process.env.PATH, LINEAR_API_KEY: "fixture", SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "fixture", FIXTURE: JSON.stringify({ offline: true }) } });
    assert.equal(lesen.status, 1);
    assert.match(lesen.stderr, /Quelle offline/);
    assert.doesNotMatch(lesen.stdout, /SCHREIBEN |UNERLAUBTER_NETZAUFRUF/, "Lesender Auftrag darf auch im Fehlerfall kein Ereignis schreiben");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
