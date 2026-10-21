import assert from "node:assert/strict";
import { test } from "node:test";
import { ausLinear, freigegebene, gemergteFuerLaufende, gespiegelteIds, grundNichtsStartbar, issueText, laufende, linearId, marker, nachruecken, offeneSpiegel, reparatur, istWorkerBranch, statusNachMerge, teilGemergte, waehle, wartetAufLiveBeleg, type LinearIssue } from "./auswahl";
import { loopZiele } from "../projekte";

const issue = (o: Partial<LinearIssue> & { identifier: string }): LinearIssue => ({
  id: o.identifier,
  title: "Titel",
  description: null,
  priority: 3,
  url: `https://linear.app/x/issue/${o.identifier}`,
  createdAt: "2026-10-01T00:00:00Z",
  labels: ["claude"],
  stateType: "unstarted",
  blockiertVon: [],
  ...o,
});

test("linearId findet die erste Kennung", () => {
  assert.equal(linearId("fix(uebersicht): Spalten (SIN-410)"), "SIN-410");
  assert.equal(linearId("ohne Kennung"), null);
  assert.equal(linearId(null), null);
});

test("gespiegelteIds liest nur die Markierung", () => {
  const ids = gespiegelteIds([
    { number: 1, body: `${marker("SIN-410")}\nText`, state: "open" },
    { number: 2, body: "SIN-999 im Text, ohne Markierung", state: "closed" },
    { number: 3, body: null, state: "open" },
  ]);
  assert.deepEqual([...ids], ["SIN-410"]);
});

test("gespiegelteIds: geschlossener Spiegel blockiert nicht, offener schon", () => {
  const issues = [issue({ identifier: "SIN-1" }), issue({ identifier: "SIN-2" })];
  const gh = [
    { number: 1, body: marker("SIN-1"), state: "closed" },
    { number: 2, body: marker("SIN-2"), state: "open" },
  ];
  assert.deepEqual(waehle(issues, gespiegelteIds(gh), 5).map((i) => i.identifier), ["SIN-1"]);
  assert.deepEqual(offeneSpiegel(gh, "SIN-1"), []);
  assert.deepEqual(offeneSpiegel(gh, "SIN-2"), [2]);
  assert.match(grundNichtsStartbar([issues[1]], gespiegelteIds(gh), 5), /gespiegelt/);
});

test("waehle: nur Todo mit Label claude, nicht blockiert, nicht gespiegelt, nach Priorität", () => {
  const issues = [
    issue({ identifier: "SIN-1", priority: 3 }),
    issue({ identifier: "SIN-2", priority: 1 }),
    issue({ identifier: "SIN-3", labels: ["design"] }),
    issue({ identifier: "SIN-4", stateType: "backlog" }),
    issue({ identifier: "SIN-5", blockiertVon: [{ identifier: "SIN-9", stateType: "unstarted" }] }),
    issue({ identifier: "SIN-6", blockiertVon: [{ identifier: "SIN-9", stateType: "completed" }], priority: 0 }),
    issue({ identifier: "SIN-7" }),
  ];
  const r = waehle(issues, new Set(["SIN-7"]), 5).map((i) => i.identifier);
  assert.deepEqual(r, ["SIN-2", "SIN-1", "SIN-6"]);
});

test("waehle: laufende Issues zählen gegen das Limit", () => {
  const issues = [issue({ identifier: "SIN-1", stateType: "started" }), issue({ identifier: "SIN-2" })];
  assert.deepEqual(waehle(issues, new Set(), 1), []);
  assert.deepEqual(waehle(issues, new Set(), 2).map((i) => i.identifier), ["SIN-2"]);
});

test("laufende: PR wartet auf Sinan (risk:high) gibt den Platz frei (SIN-678)", () => {
  const jetzt = new Date("2026-10-15T08:00:00Z");
  const lauf = issue({ identifier: "SIN-637", stateType: "started", startedAt: "2026-10-15T00:30:00Z" });
  const todo = issue({ identifier: "SIN-700" });
  const pr = (labels: string[]) => ({ titel: "feat(wirkung): x (SIN-637)", branch: "claude/sin-637", labels });
  assert.equal(laufende([lauf], { jetzt, offenePrs: [pr(["risk:high", "migration"])] }).length, 0);
  assert.equal(laufende([lauf], { jetzt, offenePrs: [pr(["risk:high", "freigegeben"])] }).length, 1, "freigegeben läuft weiter");
  assert.equal(laufende([lauf], { jetzt, offenePrs: [pr(["risk:medium"])] }).length, 1, "normaler PR hält den Platz");
  assert.deepEqual(waehle([lauf, todo], new Set(), 1, { jetzt, offenePrs: [pr(["risk:high"])] }).map((i) => i.identifier), ["SIN-700"]);
});

test("laufende: Hänger ohne PR nach 90 Min belegt keinen Platz mehr (SIN-654)", () => {
  const jetzt = new Date("2026-10-14T21:00:00Z");
  const haenger = issue({ identifier: "SIN-611", stateType: "started", startedAt: "2026-10-14T13:43:00Z" });
  const jung = issue({ identifier: "SIN-612", stateType: "started", startedAt: "2026-10-14T19:45:00Z" });
  const todo = issue({ identifier: "SIN-623" });
  assert.deepEqual(laufende([haenger, jung], { jetzt, offenePrs: [] }).map((i) => i.identifier), ["SIN-612"]);
  assert.equal(laufende([haenger], { jetzt, offenePrs: [{ titel: "feat(x): y (SIN-611)", branch: "claude/a" }] }).length, 1, "offener PR hält den Platz");
  assert.equal(laufende([haenger], { jetzt, offenePrs: [{ titel: "ohne", branch: "claude/sin-611" }] }).length, 1, "Branch zählt auch");
  assert.equal(laufende([haenger]).length, 1, "ohne Belegung wie bisher");
  assert.deepEqual(waehle([haenger, todo], new Set(), 1, { jetzt, offenePrs: [] }).map((i) => i.identifier), ["SIN-623"]);
  assert.deepEqual(waehle([haenger, todo], new Set(), 1), []);
  assert.deepEqual(freigegebene([haenger, jung], { jetzt, offenePrs: [] }).map((i) => i.identifier), ["SIN-611"]);
});

test("laufende: Hänger ohne PR und ohne Startzeit belegt keinen Platz (SIN-781)", () => {
  const jetzt = new Date("2026-10-16T16:00:00Z");
  const lauf = issue({ identifier: "SIN-738", stateType: "started", startedAt: null });
  const todo = issue({ identifier: "SIN-770" });
  assert.equal(laufende([lauf], { jetzt, offenePrs: [] }).length, 0);
  assert.equal(laufende([lauf]).length, 1, "ohne Belegung wie bisher");
  assert.deepEqual(waehle([lauf, todo], new Set(), 1, { jetzt, offenePrs: [] }).map((i) => i.identifier), ["SIN-770"]);
});

test("laufende: gemergter „Part of“-PR mit offenen Haken belegt keinen Platz (SIN-781)", () => {
  const jetzt = new Date("2026-10-16T16:00:00Z");
  const lauf = issue({ identifier: "SIN-754", stateType: "started", startedAt: "2026-10-16T15:50:00Z" });
  const todo = issue({ identifier: "SIN-770" });
  const gemergt = [{ titel: "feat(uebersicht): Haken (SIN-754)", body: "Part of SIN-754", gemergt: true }];
  const teilGemergt = teilGemergte(gemergt);
  assert.deepEqual(teilGemergt, ["SIN-754"]);
  assert.equal(laufende([lauf], { jetzt, offenePrs: [], teilGemergt }).length, 0);
  assert.deepEqual(waehle([lauf, todo], new Set(), 1, { jetzt, offenePrs: [], teilGemergt }).map((i) => i.identifier), ["SIN-770"]);
  assert.equal(laufende([lauf], { jetzt, offenePrs: [{ titel: "fix (SIN-754)", branch: "claude/sin-754" }], teilGemergt }).length, 1, "offener Folge-PR hält den Platz");
  assert.deepEqual(teilGemergte([{ titel: "fix (SIN-754)", body: "Closes #1", gemergt: true }, ...gemergt]), [], "jüngster PR ohne Part of");
  assert.deepEqual(teilGemergte([{ titel: "feat (SIN-9)", body: "Part of SIN-9", gemergt: false }]), [], "ungemergt zählt nicht");
});

test("grundNichtsStartbar: nie leer, nennt belegte Plätze oder fehlende Todo-Issues (SIN-654)", () => {
  const laeuft = issue({ identifier: "SIN-611", stateType: "started" });
  assert.equal(grundNichtsStartbar([laeuft, issue({ identifier: "SIN-623" })], new Set(), 1), "kein_platz: SIN-611 läuft (max 1)");
  assert.match(grundNichtsStartbar([], new Set(), 1), /^keine_todo: kein Todo-Issue/);
  assert.match(grundNichtsStartbar([issue({ identifier: "SIN-7" })], new Set(["SIN-7"]), 1), /^keine_todo: 1 Todo-Issue/);
});

test("issueText enthält Markierung, Link und Branch-Regel", () => {
  const t = issueText(issue({ identifier: "SIN-410", title: "Spalten", description: "Beschreibung" }));
  assert.equal(t.title, "SIN-410: Spalten");
  assert.ok(t.body.startsWith(marker("SIN-410")));
  assert.match(t.body, /claude\/sin-410/);
  assert.match(t.body, /Beschreibung/);
});

test("reparatur: zwei Runden, dann Stopp (SIN-840)", () => {
  assert.deepEqual(reparatur([]), { runde: 1 });
  assert.deepEqual(reparatur(["repair:1"]), { runde: 2 });
  assert.deepEqual(reparatur(["repair:1", "repair:2"]), { stopp: true });
  assert.deepEqual(reparatur(["repair:3"]), { stopp: true });
  assert.deepEqual(reparatur(["needs-human"]), { stopp: true });
});

test("reparatur (SIN-832): issueweiter Zähler gilt auch für einen neuen PR ohne Labels", () => {
  assert.deepEqual(reparatur([], 1), { runde: 2 });
  assert.deepEqual(reparatur([], 2), { stopp: true });
  assert.deepEqual(reparatur(["repair:1"], 2), { stopp: true });
  assert.deepEqual(reparatur([], Number.NaN), { runde: 1 });
});

test("ausLinear übernimmt Labels, Status und Blocker", () => {
  const i = ausLinear({
    id: "x",
    identifier: "SIN-1",
    title: "T",
    url: "u",
    createdAt: "2026-10-01T00:00:00Z",
    labels: { nodes: [{ name: "claude" }] },
    state: { type: "unstarted" },
    inverseRelations: {
      nodes: [
        { type: "blocks", issue: { identifier: "SIN-2", state: { type: "started" } } },
        { type: "related", issue: { identifier: "SIN-3", state: { type: "started" } } },
      ],
    },
  });
  assert.deepEqual(i.labels, ["claude"]);
  assert.equal(i.priority, 0);
  assert.deepEqual(i.blockiertVon, [{ identifier: "SIN-2", stateType: "started" }]);
});

test("nachruecken: wichtigstes Backlog-Issue ohne Design, Sinan-Aufgabe oder Blocker", () => {
  const issues = [
    issue({ identifier: "SIN-10", stateType: "backlog", labels: [], priority: 3, createdAt: "2026-10-01T00:00:00Z" }),
    issue({ identifier: "SIN-11", stateType: "backlog", labels: ["design"], priority: 1 }),
    issue({ identifier: "SIN-12", stateType: "backlog", labels: [], priority: 2 }),
    issue({ identifier: "SIN-13", stateType: "backlog", labels: ["sinan"], priority: 1 }),
    issue({ identifier: "SIN-14", stateType: "backlog", labels: [], priority: 1, blockiertVon: [{ identifier: "SIN-9", stateType: "started" }] }),
  ];
  assert.equal(nachruecken(issues, new Set(), 1)?.identifier, "SIN-12");
});

test("nachruecken: nichts, solange ein Todo wartet oder kein Platz frei ist", () => {
  const backlog = issue({ identifier: "SIN-20", stateType: "backlog", labels: [] });
  assert.equal(nachruecken([backlog, issue({ identifier: "SIN-21" })], new Set(), 1), null);
  assert.equal(nachruecken([backlog, issue({ identifier: "SIN-22", stateType: "started" })], new Set(), 1), null);
  assert.equal(nachruecken([backlog], new Set(), 1)?.identifier, "SIN-20");
});

test("waehle: Bug vor Produkt, bei knappem Kontingent nur Stufe 1-2 (SIN-633)", () => {
  const issues = [issue({ identifier: "SIN-1", priority: 1 }), issue({ identifier: "SIN-2", priority: 4, labels: ["claude", "bug"] })];
  assert.deepEqual(waehle(issues, new Set(), 2).map((i) => i.identifier), ["SIN-2", "SIN-1"]);
  assert.deepEqual(waehle(issues, new Set(), 2, undefined, 30).map((i) => i.identifier), ["SIN-2"]);
  assert.deepEqual(waehle(issues, new Set(), 2, undefined, 10), []);
});

test("gemergteFuerLaufende: nur laufende Issues mit gemergtem PR (SIN-763)", () => {
  const issues = [issue({ identifier: "SIN-1", stateType: "started" }), issue({ identifier: "SIN-2", stateType: "started" }), issue({ identifier: "SIN-3", stateType: "unstarted" })];
  const prs = [
    { nummer: 7, titel: "feat: a (SIN-1)", gemergt: true },
    { nummer: 8, titel: "feat: b (SIN-2)", gemergt: false },
    { nummer: 9, titel: "feat: c (SIN-3)", gemergt: true },
  ];
  assert.deepEqual(gemergteFuerLaufende(issues, prs), [{ identifier: "SIN-1", pr: 7 }]);
});

test("loopZiele: nur Produkte mit Repo, Linear-Projekt und Bauphase (SIN-763)", () => {
  const ids = loopZiele().map((z) => z.id);
  assert.ok(ids.includes("leitstand") && ids.includes("sjcode-website"));
  assert.ok(!ids.includes("lernapp") && !ids.includes("beleg"));
});

test("SIN-846: nur offene Belege-Haken: kein Bau-Worker, kein Platz", () => {
  const beleg = "- [x] Code\n- [ ] Zählung je Kurs\n- [ ] Run-Link";
  assert.deepEqual(waehle([issue({ identifier: "SIN-1", description: beleg })], new Set(), 5), []);
  assert.deepEqual(waehle([issue({ identifier: "SIN-2", description: beleg + "\n- [ ] Code bauen" })], new Set(), 5).map((i) => i.identifier), ["SIN-2"]);
  assert.equal(laufende([issue({ identifier: "SIN-1", description: beleg, stateType: "started" })]).length, 0);
});

test("codex/-Branch mit Linear-Kennung zählt im Reparaturzähler, nach 2 Runden Stopp (SIN-854)", () => {
  assert.equal(istWorkerBranch("codex/auftrag-sin-854"), true);
  assert.equal(istWorkerBranch("claude/sin-854"), true);
  assert.equal(istWorkerBranch("feature/x"), false);
  assert.equal(linearId("fix(loop): Gate (SIN-854)"), "SIN-854");
  assert.deepEqual(reparatur([], 1), { runde: 2 });
  assert.deepEqual(reparatur([], 2), { stopp: true });
});

test("loopZiele enthält Stromlauf AI (SIN-798)", () => {
  assert.deepEqual(loopZiele().find((z) => z.id === "stromlauf-ai"), { id: "stromlauf-ai", repo: "siinanXD/stromlauf-ai", linearProjekt: "Stromlauf AI" });
});

const LIVE = "## Fertig, wenn\n\n- [x] Test grün\n- [ ] \\[nach Aktivierung\\] Zeile in loop_events\n";
const NORMAL = "## Fertig, wenn\n\n- [x] Test grün\n- [ ] Probe in docs/abnahme\n- [ ] \\[nach Aktivierung\\] Zeile in loop_events\n";
const jetzt = new Date("2026-10-21T18:00:00Z");
const belegung = (gemergt: string[]) => ({ jetzt, offenePrs: [], gemergt });

test("Test: gemergter PR + nur `[nach Aktivierung]` offen → nicht in `laufende()`, nicht in `waehle()`", () => {
  const lauf = issue({ identifier: "SIN-904", description: LIVE, stateType: "started", startedAt: "2026-10-21T17:30:00Z" });
  const todo = issue({ identifier: "SIN-917", description: LIVE });
  assert.equal(wartetAufLiveBeleg(lauf, ["SIN-904"]), true);
  assert.deepEqual(laufende([lauf], belegung(["SIN-904"])), []);
  assert.deepEqual(waehle([todo], new Set(), 2, belegung(["SIN-917"])), []);
  assert.equal(statusNachMerge({ status: "offen", offen: ["\\[nach Aktivierung\\] Zeile in loop_events"] }), "In Review");
});

test("Test: gemergter PR + ein normaler Haken offen → bleibt wie bisher (Folge-Worker möglich)", () => {
  const lauf = issue({ identifier: "SIN-904", description: NORMAL, stateType: "started", startedAt: "2026-10-21T17:30:00Z" });
  const todo = issue({ identifier: "SIN-917", description: NORMAL });
  assert.equal(wartetAufLiveBeleg(lauf, ["SIN-904"]), false);
  assert.deepEqual(laufende([lauf], belegung(["SIN-904"])).map((i) => i.identifier), ["SIN-904"]);
  assert.deepEqual(waehle([todo], new Set(), 2, belegung(["SIN-917"])).map((i) => i.identifier), ["SIN-917"]);
  assert.equal(statusNachMerge({ status: "offen", offen: ["Probe in docs/abnahme", "[nach Aktivierung] Zeile"] }), "Todo");
  assert.equal(statusNachMerge({ status: "done", offen: [] }), "Done");
});

test("Test: Issue ohne gemergten PR → unverändert", () => {
  const lauf = issue({ identifier: "SIN-913", description: LIVE, stateType: "started", startedAt: "2026-10-21T17:30:00Z" });
  const todo = issue({ identifier: "SIN-913", description: LIVE });
  assert.equal(wartetAufLiveBeleg(lauf, ["SIN-904"]), false);
  assert.deepEqual(laufende([lauf], belegung(["SIN-904"])).map((i) => i.identifier), ["SIN-913"]);
  assert.deepEqual(waehle([todo], new Set(), 2, belegung([])).map((i) => i.identifier), ["SIN-913"]);
});
