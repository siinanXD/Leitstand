import assert from "node:assert/strict";
import { test } from "node:test";
import { gemergteFuerLaufende, gespiegelteIds, laufende, marker, statusNachMerge, waehle, type LinearIssue } from "./auswahl";
import { entscheide, leseHaken } from "./haken";
import { maxParallel, parallelAuswahl, parallelRepo } from "./parallel";
import { beendeterLaufOhnePr, MAX_OHNE_DIFF, ohneDiffGrund, zaehleOhneDiff, type WorkerLauf } from "./ohne-pr";
import { loopZiele } from "../projekte";

const issue = (identifier: string, o: Partial<LinearIssue> = {}): LinearIssue => ({
  id: identifier, identifier, title: "Titel", description: null, priority: 3, url: "", createdAt: "2026-10-01T00:00:00Z",
  labels: ["claude"], stateType: "unstarted", blockiertVon: [], ...o,
});
const pfade = (...p: string[]) => `<!-- worker-pfade: ${JSON.stringify(p)} -->`;

test("Test: Lern-App-Issue wird vom Leitstand-Dispatcher gespiegelt und belegt einen Lern-App-Platz", () => {
  const ziel = loopZiele().find((z) => z.id === "lernapp");
  assert.deepEqual(ziel, { id: "lernapp", repo: "siinanXD/Content-Agent-Lernapp", linearProjekt: "Content-Agent-Lernapp" });
  assert.ok(parallelRepo(ziel!.repo));
  const max = maxParallel(ziel!.repo, "1", "2");
  assert.equal(max, 2);

  const a = issue("SIN-1", { description: pfade("src/app/a") }), b = issue("SIN-2", { description: pfade("src/app/b") }), c = issue("SIN-3", { description: pfade("src/app/c") });
  // Spiegeln: zwei der drei Todo-Issues starten (höchstens 2 je Produkt), die Auswahl ist nach Pfaden abgegrenzt.
  const wahl = parallelAuswahl(waehle([a, b, c], new Set(), 3), [], max);
  assert.deepEqual(wahl.map((i) => i.identifier), ["SIN-1", "SIN-2"]);

  // Gespiegelt und „In Progress“: belegt einen Lern-App-Platz, das dritte Issue wartet; ein Platz bleibt nur für fremde Pfade.
  const gespiegelt = gespiegelteIds([{ number: 7, body: marker("SIN-1"), state: "open" }]);
  const laufend = laufende([{ ...a, stateType: "started", startedAt: "2026-10-23T02:00:00Z" }, b, c], { jetzt: new Date("2026-10-23T02:30:00Z"), offenePrs: [] });
  assert.deepEqual(laufend.map((i) => i.identifier), ["SIN-1"]);
  assert.ok(!waehle([a, b], gespiegelt, 3).some((i) => i.identifier === "SIN-1"));
  assert.deepEqual(parallelAuswahl([b, c], laufend, max).map((i) => i.identifier), ["SIN-2"]);
  // Überschneidende Schreibpfade laufen nie zugleich.
  assert.deepEqual(parallelAuswahl([issue("SIN-4", { description: pfade("src/app/a/page.tsx") })], laufend, max), []);
});

test("Test: Lern-App-Merge setzt das Issue nach statusNachMerge", () => {
  const lauf = issue("SIN-9", { stateType: "started" });
  const fertig = gemergteFuerLaufende([lauf, issue("SIN-10", { stateType: "started" })], [{ nummer: 5, titel: "feat(x): y (SIN-9)", gemergt: true }, { nummer: 6, titel: "feat(x): z (SIN-10)", gemergt: false }]);
  assert.deepEqual(fertig, [{ identifier: "SIN-9", pr: 5 }]);

  const haken = (text: string) => leseHaken(text);
  // alles belegt → Done
  assert.equal(statusNachMerge(entscheide({ haken: haken("- [x] Code\n"), belege: null, teil: false, runde: 1 })), "Done");
  // nur [nach Aktivierung] offen → In Review, nie zurück auf Todo
  const live = entscheide({ haken: haken("- [x] Code\n- [ ] \\[nach Aktivierung\\] Lauf-Link\n"), belege: null, teil: false, runde: 1 });
  assert.equal(statusNachMerge(live), "In Review");
  // normaler Haken offen → Todo für den Folge-Worker
  assert.equal(statusNachMerge(entscheide({ haken: haken("- [x] Code\n- [ ] Probe\n"), belege: null, teil: true, runde: 1 })), "Todo");
});

const lauf = (o: Partial<WorkerLauf> = {}): WorkerLauf => ({ id: 11, titel: "SIN-576: Selbstlern-Schleife", status: "completed", conclusion: "success", gestartet: "2026-10-21T10:00:30Z", url: "https://github.com/siinanXD/Leitstand/actions/runs/11", ...o });
const claim = { issue: "SIN-576", seit: "2026-10-21T10:00:00Z" };

test("SIN-937: beendeter claude.yml-Lauf ohne PR gibt den Claim sofort frei", () => {
  assert.equal(beendeterLaufOhnePr(claim, [lauf()], [])?.id, 11);
  // läuft noch / wartet: Claim bleibt
  assert.equal(beendeterLaufOhnePr(claim, [lauf({ status: "in_progress", conclusion: null })], []), null);
  assert.equal(beendeterLaufOhnePr(claim, [lauf(), lauf({ id: 12, status: "queued", conclusion: null })], []), null);
  // PR offen oder seit dem Claim gemergt: kein Lauf ohne PR
  assert.equal(beendeterLaufOhnePr(claim, [lauf()], [{ titel: "feat: a (SIN-576)", offen: true, gemergtAm: null }]), null);
  assert.equal(beendeterLaufOhnePr(claim, [lauf()], [{ titel: "feat: a (SIN-576)", offen: false, gemergtAm: "2026-10-21T10:30:00Z" }]), null);
  // ein früherer Merge (vor dem Claim) und ein anderes Issue zählen nicht
  assert.equal(beendeterLaufOhnePr(claim, [lauf()], [{ titel: "feat: a (SIN-576)", offen: false, gemergtAm: "2026-10-20T10:30:00Z" }])?.id, 11);
  assert.equal(beendeterLaufOhnePr(claim, [lauf({ titel: "SIN-551: Hausmeister" })], []), null);
  // Lauf vor dem Claim gehört zu einem früheren Versuch; ohne Claim-Zeit nie ein Treffer
  assert.equal(beendeterLaufOhnePr(claim, [lauf({ gestartet: "2026-10-21T08:00:00Z" })], []), null);
  assert.equal(beendeterLaufOhnePr({ issue: "SIN-576", seit: null }, [lauf()], []), null);
});

test("SIN-937: nach zwei Läufen ohne Diff gilt das Issue als gestoppt, ein Merge setzt zurück", () => {
  const ohne = { step: "worker", grund: ohneDiffGrund(lauf(), 1) };
  assert.equal(zaehleOhneDiff([]), 0);
  assert.equal(zaehleOhneDiff([ohne]) + 1 >= MAX_OHNE_DIFF, true);
  assert.equal(zaehleOhneDiff([]) + 1 >= MAX_OHNE_DIFF, false);
  assert.equal(zaehleOhneDiff([ohne, { step: "merge", grund: null }, ohne, ohne]), 1);
  assert.equal(zaehleOhneDiff([{ step: "worker", grund: "anderer Grund" }, ohne]), 1);
  assert.match(ohneDiffGrund(lauf(), 2), /Lauf 2 von 2/);
});
