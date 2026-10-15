import assert from "node:assert/strict";
import { test } from "node:test";
import {
  entscheidungenAusKommentaren,
  entscheidungsText,
  erkenneIssueHaenger,
  erkennePrHaenger,
  erledigtSeit,
  gesundheit,
  kommtAlsNeuInFrage,
  kurzfassung,
  leitstandSnapshot,
  MARKER_ZURUECK,
  planeSchlange,
  pruefeNeuesProjekt,
  repoAusLinks,
  tagesstand,
  updateFaellig,
  type PrInfo,
  type Projekt,
  type WaechterIssue,
} from "./waechter";

const jetzt = new Date("2026-10-09T12:00:00Z");
const vor = (h: number) => new Date(jetzt.getTime() - h * 3_600_000).toISOString();

const issue = (o: Partial<WaechterIssue> & { identifier: string }): WaechterIssue => ({
  id: o.identifier,
  title: "Titel",
  description: null,
  priority: 3,
  url: "u",
  createdAt: "2026-10-01T00:00:00Z",
  labels: ["claude"],
  stateType: "unstarted",
  blockiertVon: [],
  startedAt: null,
  kommentare: [],
  ...o,
});

const pr = (o: Partial<PrInfo> = {}): PrInfo => ({
  number: 7,
  titel: "feat(x): y (SIN-1)",
  branch: "claude/sin-1",
  labels: [],
  ciRot: true,
  runUrl: "https://run",
  letzterCommitAt: vor(1),
  letzteReparaturAt: null,
  ...o,
});

const projekt = (o: Partial<Projekt> = {}): Projekt => ({
  id: "p",
  name: "Neu",
  statusTyp: "planned",
  zusammenfassung: null,
  beschreibung: "Ein Satz. Noch einer.",
  leadId: null,
  prioritaet: 0,
  createdAt: vor(24),
  links: [],
  ...o,
});

test("repoAusLinks liest GitHub-Links nach Titel", () => {
  assert.equal(repoAusLinks([{ label: "GitHub", url: "https://github.com/siinanXD/Leitstand" }]), "siinanXD/Leitstand");
  assert.equal(repoAusLinks([{ label: "GitHub Repo", url: "https://github.com/a/b.git" }]), "a/b");
  assert.equal(repoAusLinks([{ label: "Figma", url: "https://github.com/a/b" }]), null);
  assert.equal(repoAusLinks([]), null);
});

test("Nachrücken: Backlog-Issue rückt nach, nie design/sinan/needs-human", () => {
  const issues = [
    issue({ identifier: "SIN-1", stateType: "backlog", labels: ["design"], priority: 1 }),
    issue({ identifier: "SIN-2", stateType: "backlog", labels: [], priority: 3 }),
    issue({ identifier: "SIN-3", stateType: "backlog", labels: [], priority: 2 }),
  ];
  const a = planeSchlange(issues, new Set());
  assert.ok(a && a.art === "nachruecken" && a.issue.identifier === "SIN-3");
});

test("Nachrücken: startbares Todo oder laufendes Issue verhindert es", () => {
  const backlog = issue({ identifier: "SIN-2", stateType: "backlog", labels: [] });
  assert.equal(planeSchlange([backlog, issue({ identifier: "SIN-3" })], new Set()), null);
  assert.equal(planeSchlange([backlog, issue({ identifier: "SIN-3", stateType: "started" })], new Set()), null);
});

test("Planungs-Issue nur bei leerer Schlange und leerem Backlog, höchstens eins", () => {
  assert.deepEqual(planeSchlange([], new Set()), { art: "planung" });
  assert.deepEqual(planeSchlange([issue({ identifier: "SIN-9", stateType: "completed" })], new Set()), { art: "planung" });
  const offenePlanung = issue({ identifier: "SIN-8", stateType: "backlog", labels: ["sinan"], title: "Nächste Schritte planen" });
  assert.equal(planeSchlange([offenePlanung], new Set()), null);
  const gesperrt = issue({ identifier: "SIN-7", stateType: "backlog", labels: ["sinan"] });
  assert.deepEqual(planeSchlange([gesperrt], new Set()), { art: "planung" });
});

test("Hänger: In Progress > 6 h ohne PR → zurück, danach needs-human", () => {
  const alt = issue({ identifier: "SIN-1", stateType: "started", startedAt: vor(7) });
  assert.deepEqual(erkenneIssueHaenger([alt], [], jetzt).map((a) => a.art), ["zuruecksetzen"]);
  const zweites = { ...alt, kommentare: [`x ${MARKER_ZURUECK}`] };
  assert.deepEqual(erkenneIssueHaenger([zweites], [], jetzt).map((a) => a.art), ["needs-human"]);
});

test("Hänger: Epic oder Handarbeit ohne Label claude bleibt In Progress", () => {
  const epic = issue({ identifier: "SIN-242", stateType: "started", startedAt: vor(30), labels: [] });
  const sinan = issue({ identifier: "SIN-5", stateType: "started", startedAt: vor(30), labels: ["sinan"] });
  assert.deepEqual(erkenneIssueHaenger([epic, sinan], [], jetzt), []);
});

test("Hänger: Claude-Pause nach dem Start → sofort zurück auf Todo, nie needs-human (SIN-581)", () => {
  const jung = issue({ identifier: "SIN-1", stateType: "started", startedAt: vor(1), kommentare: [`x ${MARKER_ZURUECK}`] });
  const a = erkenneIssueHaenger([jung], [], jetzt, [vor(0.5)]);
  assert.deepEqual(a.map((x) => [x.art, x.kontingent]), [["zuruecksetzen", true]]);
  assert.equal(erkenneIssueHaenger([jung], [], jetzt, [vor(3)]).length, 0, "Pause vor dem Start zählt nicht");
  assert.equal(erkenneIssueHaenger([jung], [pr()], jetzt, [vor(0.5)]).length, 0);
});

test("Hänger: junges Issue, offener PR oder needs-human werden übersprungen", () => {
  const jung = issue({ identifier: "SIN-1", stateType: "started", startedAt: vor(5) });
  const alt = issue({ identifier: "SIN-1", stateType: "started", startedAt: vor(8) });
  assert.equal(erkenneIssueHaenger([jung], [], jetzt).length, 0);
  assert.equal(erkenneIssueHaenger([alt], [pr()], jetzt).length, 0);
  assert.equal(erkenneIssueHaenger([{ ...alt, labels: ["claude", "needs-human"] }], [], jetzt).length, 0);
});

test("PR-Hänger: rot und 30 Minuten ohne Commit → @claude, Runden zählen, dann Stopp", () => {
  assert.deepEqual(erkennePrHaenger([pr()], jetzt).map((a) => a.art), ["reparatur"]);
  const a = erkennePrHaenger([pr({ labels: ["repair:1"] })], jetzt)[0];
  assert.ok(a.art === "reparatur" && a.runde === 2);
  assert.deepEqual(erkennePrHaenger([pr({ labels: ["repair:3"] })], jetzt).map((x) => x.art), ["stopp"]);
});

test("PR-Hänger: grün, frischer Commit, frische Bitte oder needs-human → nichts", () => {
  assert.equal(erkennePrHaenger([pr({ ciRot: false })], jetzt).length, 0);
  assert.equal(erkennePrHaenger([pr({ letzterCommitAt: vor(0.2) })], jetzt).length, 0);
  assert.equal(erkennePrHaenger([pr({ letzteReparaturAt: vor(0.1) })], jetzt).length, 0);
  assert.equal(erkennePrHaenger([pr({ labels: ["needs-human"] })], jetzt).length, 0);
  assert.equal(erkennePrHaenger([pr({ labels: ["repair:3"], letzteReparaturAt: vor(3), letzterCommitAt: vor(2) })], jetzt).length, 0);
});

test("Neues Projekt: fehlende Felder ergänzen und Einrichten-Issue", () => {
  const r = pruefeNeuesProjekt(projekt(), [], jetzt)!;
  assert.deepEqual(r.aenderung, { zusammenfassung: "Ein Satz.", leadSinan: true, prioritaet: 3 });
  assert.ok(r.einrichten && r.einrichten.sinanAufgaben.length > 0);
});

test("Neues Projekt: vollständig, mit Link, vorhandenes Einrichten-Issue, alt oder pausiert", () => {
  const voll = projekt({ zusammenfassung: "z", leadId: "l", prioritaet: 2, links: [{ label: "GitHub", url: "https://github.com/a/b" }] });
  const r = pruefeNeuesProjekt(voll, [], jetzt)!;
  assert.deepEqual(r.aenderung, {});
  assert.equal(r.einrichten, null);
  assert.equal(pruefeNeuesProjekt(projekt(), [{ title: "Projekt einrichten", stateType: "backlog" }], jetzt)!.einrichten, null);
  assert.equal(pruefeNeuesProjekt(projekt({ createdAt: vor(24 * 8) }), [], jetzt), null);
  assert.equal(pruefeNeuesProjekt(projekt({ zusammenfassung: "Pausiert bis Q1" }), [], jetzt), null);
  assert.equal(pruefeNeuesProjekt(projekt({ statusTyp: "completed" }), [], jetzt), null);
});

test("Vorprüfung: abgebrochene, erledigte, alte und pausierte Projekte laden keine Issues", () => {
  assert.equal(kommtAlsNeuInFrage(projekt(), jetzt), true);
  assert.equal(kommtAlsNeuInFrage(projekt({ statusTyp: "canceled" }), jetzt), false);
  assert.equal(kommtAlsNeuInFrage(projekt({ statusTyp: "completed" }), jetzt), false);
  assert.equal(kommtAlsNeuInFrage(projekt({ createdAt: vor(24 * 8) }), jetzt), false);
  assert.equal(kommtAlsNeuInFrage(projekt({ zusammenfassung: "Pausiert bis nach dem 12.10.2026." }), jetzt), false);
});

test("erledigtSeit: 48 Stunden zurück, als ISO-Zeit", () => {
  assert.equal(erledigtSeit(jetzt), "2026-10-07T12:00:00.000Z");
});

test("kurzfassung kürzt auf 255 Zeichen", () => {
  assert.equal(kurzfassung(null), null);
  assert.ok(kurzfassung("a".repeat(400))!.length <= 255);
});

test("Tagesupdate: Gruppen, Gesundheit, Fälligkeit", () => {
  const issues = [
    issue({ identifier: "SIN-1", stateType: "completed", completedAt: vor(3) }),
    issue({ identifier: "SIN-2", stateType: "completed", completedAt: vor(30) }),
    issue({ identifier: "SIN-3", stateType: "started", startedAt: vor(1) }),
    issue({ identifier: "SIN-4", stateType: "backlog", labels: ["sinan"] }),
  ];
  const s = tagesstand(issues, [], jetzt);
  assert.equal(s.erledigt24h.length, 1);
  assert.equal(s.inArbeit.length, 1);
  assert.equal(s.wartetAufSinan.length, 1);
  assert.equal(gesundheit(s), "atRisk");
  assert.equal(gesundheit({ ...s, wartetAufSinan: [] }), "onTrack");
  assert.equal(updateFaellig(vor(25), jetzt), true);
  assert.equal(updateFaellig(vor(5), jetzt), false);
  assert.equal(updateFaellig(null, jetzt), true);
});

test("leitstandSnapshot: Spalten wie loop_snapshot (fertig_v1/gesamt_v1, kein progress)", () => {
  const z = leitstandSnapshot([issue({ identifier: "SIN-1" }), issue({ identifier: "SIN-2", stateType: "started" })], [], "siinanXD/Leitstand", { fertig: 3, gesamt: 10 });
  assert.deepEqual(z.queue, { todo: 1, startable: 1, in_progress: 1 });
  assert.equal(z.fertig_v1, 3);
  assert.equal(z.gesamt_v1, 10);
  assert.equal("progress" in z, false);
  assert.equal(leitstandSnapshot([], [], "r", null).fertig_v1, null);
});

test("leitstandSnapshot: gemergter risk:high-PR bleibt nicht in open_prs (SIN-699)", () => {
  const z = leitstandSnapshot([], [pr({ number: 184, labels: ["risk:high"], gemergtAt: "2026-10-15T15:14:00Z" }), pr({ number: 201 })], "r", null);
  assert.deepEqual(z.open_prs.map((p) => p.nummer), [201]);
});

test("Entscheidung: im Linear-Kommentar führt zu Label und PR-Kommentar (SIN-651)", () => {
  const r = entscheidungenAusKommentaren([
    "Entscheidung: [siinanXD/Content-Agent-Lernapp#350](https://linear.app/x) ja, automatisch",
    "Entscheidung: siinanXD/Content-Agent-Lernapp#350 nein",
    "Entscheidung: siinanXD/Fremd#1 ja",
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].nummer, 350);
  assert.match(entscheidungsText(r[0]), /ja, automatisch/);
});

test("Ohne passenden Kommentar bleibt die Frage offen (SIN-651)", () => {
  assert.deepEqual(entscheidungenAusKommentaren(["siinanXD/Content-Agent-Lernapp#350 ja", "Hinweis: siinanXD/Content-Agent-Lernapp#350", "Entscheidung: ja, ohne PR"]), []);
});
