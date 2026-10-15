import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSnapshot } from "./uebersicht";
import { tabTitel, wartendePrs } from "./wartende-prs";

const pr = (nummer: number, extra: Record<string, unknown> = {}) => ({ number: nummer, title: `PR ${nummer}`, labels: ["risk:high"], draft: false, ci: "success", ...extra });
const nr = (open_prs: unknown[], project = "lernapp") => wartendePrs(parseSnapshot([{ project, open_prs }])).map((p) => p.nummer);

test("wartendePrs: risk:high oder needs-human, CI grün, kein Entwurf", () => {
  assert.deepEqual(nr([pr(1), pr(2, { labels: ["needs-human"] }), pr(3, { labels: [{ name: "Risk:High" }] })]), [1, 2, 3]);
  assert.deepEqual(nr([pr(4, { draft: true }), pr(5, { ci: "failure" }), pr(6, { ci: undefined }), pr(7, { labels: ["claude"] }), pr(8, { labels: ["risk:high", "freigegeben"] })]), []);
});

test("wartendePrs: auch no-automerge und Migrations-PRs (SIN-635)", () => {
  assert.deepEqual(nr([pr(1, { labels: ["no-automerge"] }), pr(2, { labels: ["claude", "migration"] })]), [1, 2]);
});

test("wartendePrs: alle Projekte, Repo aus Projekt, ohne bekanntes Repo kein Knopf, Grund aus dem Gate", () => {
  const s = parseSnapshot([
    { project: "lernapp", open_prs: [pr(1, { reason: "Gate: Migration ohne Rollback." })] },
    { project: "leitstand", open_prs: JSON.stringify([pr(2, { labels: ["needs-human"] })]) },
    { project: "fremd", open_prs: [pr(3)] },
  ]);
  const w = wartendePrs(s);
  assert.deepEqual(w.map((p) => [p.repo, p.nummer]), [["siinanXD/Content-Agent-Lernapp", 1], ["siinanXD/Leitstand", 2]]);
  assert.equal(w[0].grund, "Gate: Migration ohne Rollback.");
  assert.match(w[1].grund, /needs-human/);
});

test("wartendePrs: ohne open_prs leer; tabTitel zeigt die Zahl", () => {
  assert.deepEqual(wartendePrs(parseSnapshot([{ project: "lernapp" }])), []);
  assert.equal(tabTitel(4), "(4) Leitstand");
  assert.equal(tabTitel(0), "Leitstand");
});
