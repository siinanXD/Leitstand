import assert from "node:assert/strict";
import { test } from "node:test";
import type { LinearIssue } from "../loop/auswahl";
import { aufrufKosten, gemeinsam, ledgerZeile, leseDateien, parsePlan, pfade, plane, restDeckel, spurAnzeige, spurCTauglich, stellen } from "./vorarbeiter";

const issue = (n: number, o: Partial<LinearIssue> & { text?: string } = {}): LinearIssue => ({
  id: `id-${n}`,
  identifier: `SIN-${n}`,
  title: `Aufgabe ${n}`,
  description: o.text ?? null,
  priority: 3,
  url: `https://linear.app/x/${n}`,
  createdAt: `2026-10-0${n}T00:00:00Z`,
  labels: ["claude"],
  stateType: "unstarted",
  blockiertVon: [],
  ...o,
});

/** 8 Issues: zwei Dateien-Gruppen, ein Blocker, ein Docs-Issue, drei, die warten müssen. */
const fixture = [
  issue(1, { text: "Ändert `src/lib/a.ts`.", labels: ["claude", "readiness"] }),
  issue(2, { text: "Baut src/app/b/page.tsx neu." }),
  issue(3, { text: "Erweitert src/lib/a.ts um eine Funktion." }),
  issue(4, { text: "Schreibt docs/decisions/SIN-4-x.md.", labels: ["claude", "groesse:klein"] }),
  issue(5, { text: "Nutzt src/app/c/", blockiertVon: [{ identifier: "SIN-2", stateType: "unstarted" }] }),
  issue(6, { text: "Braucht SIN-9.", blockiertVon: [{ identifier: "SIN-9", stateType: "backlog" }] }),
  issue(7, { text: "Fasst src/lib/a.ts und src/app/b/page.tsx an." }),
  issue(8, { text: "Ändert .github/workflows/x.yml" }),
];

test("Fixture mit 8 Issues: mindestens 2 parallele Spuren ohne Überschneidung", () => {
  const plan = plane(fixture, new Date("2026-10-13T06:10:00Z"));
  const je = (id: string) => plan.spuren.find((s) => s.id === id)!.eintraege.map((e) => e.issue);
  assert.deepEqual(je("A"), ["SIN-1", "SIN-3"]); // Fertig-Liste zuerst, SIN-3 teilt a.ts
  assert.deepEqual(je("B"), ["SIN-2", "SIN-5"]); // SIN-5 folgt seinem Blocker
  assert.deepEqual(je("C"), ["SIN-4"]);
  assert.deepEqual(plan.wartet.map((w) => w.issue).sort(), ["SIN-6", "SIN-7", "SIN-8"]);
  assert.match(plan.wartet.find((w) => w.issue === "SIN-7")!.grund, /Spur A und B/);
  assert.match(plan.wartet.find((w) => w.issue === "SIN-8")!.grund, /CEO/);

  const volle = plan.spuren.filter((s) => s.eintraege.length);
  assert.ok(volle.length >= 2);
  const stelle = new Map(fixture.map((i) => [i.identifier, stellen(i)]));
  for (const a of volle) for (const b of volle) if (a.id < b.id) for (const x of a.eintraege) for (const y of b.eintraege) assert.equal(gemeinsam(stelle.get(x.issue)!, stelle.get(y.issue)!), false, `${x.issue} und ${y.issue}`);
});

test("Reihenfolge: readiness, dann dringend, dann Priorität und Alter", () => {
  const plan = plane([
    issue(1, { text: "src/a/x.ts", priority: 4 }),
    issue(2, { text: "src/a/x.ts", priority: 1 }),
    issue(3, { text: "src/a/x.ts", labels: ["claude", "readiness"], priority: 4 }),
  ]);
  assert.deepEqual(plan.spuren[0].eintraege.map((e) => e.issue), ["SIN-3", "SIN-2", "SIN-1"]);
});

test("Laufende Issues sperren ihre Dateien; Zurückgehaltenes fällt weg, Loop-Infra nur mit Freigabe", () => {
  const plan = plane([
    issue(1, { text: "src/lib/a.ts", stateType: "started" }),
    issue(2, { text: "src/lib/a.ts" }),
    issue(3, { text: "src/lib/z.ts", labels: ["claude", "sinan"] }),
    issue(4, { text: "scripts/loop/loop.ts", labels: ["claude", "ceo-freigabe"] }),
  ]);
  assert.match(plan.wartet[0].grund, /SIN-1/);
  assert.deepEqual(plan.spuren.flatMap((s) => s.eintraege.map((e) => e.issue)), ["SIN-4"]);
});

test("Pfade, Bereich als Ersatz, Spur-C-Tauglichkeit", () => {
  assert.deepEqual(pfade("Siehe `docs/a/b.md`, src/x/. Und docs/c.md."), ["docs/a/b.md", "src/x", "docs/c.md"]);
  assert.deepEqual(stellen(issue(1, { labels: ["claude", "bereich:Kosten"] })), ["bereich:kosten"]);
  assert.deepEqual(stellen(issue(1)), []);
  assert.equal(gemeinsam(["src/lib"], ["src/lib/a.ts"]), true);
  assert.equal(gemeinsam(["src/lib"], ["src/library/a.ts"]), false);
  assert.equal(spurCTauglich(issue(1, { text: "docs/a.md", labels: ["claude", "groesse:klein"] })), true);
  assert.equal(spurCTauglich(issue(1, { text: "docs/a.md src/b.ts", labels: ["claude", "groesse:klein"] })), false);
  assert.equal(spurCTauglich(issue(1, { text: "docs/a.md" })), false);
});

test("Anzeige: was läuft und was als Nächstes kommt; Plan übersteht JSON", () => {
  const plan = plane(fixture);
  const a = spurAnzeige(parsePlan(JSON.parse(JSON.stringify(plan)))!, new Set(["SIN-1"]));
  assert.equal(a[0].laeuft?.issue, "SIN-1");
  assert.deepEqual(a[0].naechste.map((e) => e.issue), ["SIN-3"]);
  assert.equal(a[2].laeuft, null);
  assert.equal(parsePlan("kaputt"), null);
  assert.equal(parsePlan({ spuren: 1 }), null);
});

test("Kosten von Spur C: Euro, Deckel 2 €, Ledger-Zeile", () => {
  const eur = aufrufKosten(10_000, 2_000, { einProMio: 1, ausProMio: 5 }, 0.9);
  assert.equal(eur, 0.018);
  assert.deepEqual(ledgerZeile(eur), { cost_eur: 0.018 });
  assert.equal(restDeckel(0.5), 1.5);
  assert.equal(restDeckel(2.5), 0);
});

test("Modellantwort von Spur C: nur Markdown unter docs/ und nur genannte Pfade, alles oder nichts", () => {
  const erlaubt = ["docs/decisions/SIN-4-x.md"];
  const gut = { dateien: [{ pfad: "docs/decisions/SIN-4-x.md", inhalt: "# Text" }] };
  assert.equal(leseDateien(gut, erlaubt)?.length, 1);
  assert.equal(leseDateien({ dateien: [{ pfad: "src/a.ts", inhalt: "x" }] }, ["src/a.ts"]), null);
  assert.equal(leseDateien({ dateien: [{ pfad: "docs/../.github/x.md", inhalt: "x" }] }, ["docs"]), null);
  assert.equal(leseDateien({ dateien: [{ pfad: "docs/anderes.md", inhalt: "x" }] }, erlaubt), null);
  assert.equal(leseDateien({ dateien: [...gut.dateien, { pfad: "docs/decisions/SIN-4-x.md", inhalt: " " }] }, erlaubt), null);
  assert.equal(leseDateien({ dateien: [] }, erlaubt), null);
  assert.equal(leseDateien(null, erlaubt), null);
});
