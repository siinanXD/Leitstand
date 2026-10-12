import assert from "node:assert/strict";
import { test } from "node:test";
import { issueText } from "../loop/auswahl";
import { erstelleBericht, kostenRichtwert, lehreDatei, leseLehre, lehrenIndex, passendeLehren, skillVorschlaege, slug, workerHinweise, type LernEreignis } from "./lernen";

const jetzt = new Date("2026-10-12T05:30:00Z");
const ev = (o: Partial<LernEreignis>): LernEreignis => ({ created_at: "2026-10-12T01:00:00Z", step: "repair", status: "fehler", issue: "SIN-1", pr: null, agent: null, cost: null, ...o });

test("slug: Umlaute und Sonderzeichen", () => {
  assert.equal(slug("Würfel & Größe!"), "wuerfel-groesse");
  assert.equal(slug("!!!"), "thema");
});

test("zwei gleiche Fehler → eine Lehre, Worker-Prompt enthält sie", () => {
  const b = erstelleBericht([ev({ issue: "SIN-1" }), ev({ issue: "SIN-2" }), ev({ step: "work", status: "ok", issue: "SIN-3" })], [], jetzt);
  assert.equal(b.fehler.length, 1);
  assert.equal(b.fehler[0].anzahl, 2);
  const datei = lehreDatei(b.fehler[0], ["claude"]);
  assert.equal(datei.pfad, "docs/autonomy/lehren/repair-fehler.md");
  const lehre = leseLehre(datei.pfad, datei.inhalt);
  const hinweise = workerHinweise([lehre], [], null, { labels: ["claude"] });
  assert.match(hinweise, /repair fehler/);
  const issue = { id: "x", identifier: "SIN-9", title: "T", description: null, priority: 3, url: "u", createdAt: "", labels: ["claude"], stateType: "unstarted", blockiertVon: [] };
  assert.match(issueText(issue, hinweise).body, /Gelernt aus früheren Läufen/);
});

test("ein einzelner Fehler und alte Ereignisse zählen nicht", () => {
  const b = erstelleBericht([ev({}), ev({ created_at: "2026-10-10T01:00:00Z" })], [], jetzt);
  assert.equal(b.fehler.length, 0);
  assert.equal(b.ereignisse, 1);
});

test("Lehren passen nur zu Labels/Bereich/Dateien; Hinweise max. 15 Zeilen", () => {
  const a = leseLehre("a.md", "# A\nGilt für: design\n\nText A");
  const alle = leseLehre("b.md", "# B\nGilt für: alle\n\nText B");
  assert.deepEqual(passendeLehren([a, alle], { labels: ["claude"] }).map((l) => l.titel), ["B"]);
  assert.deepEqual(passendeLehren([a, alle], { labels: ["design"] }).map((l) => l.titel), ["A", "B"]);
  const viele = Array.from({ length: 30 }, (_, i) => leseLehre(`${i}.md`, `# L${i}\n\nText`));
  const h = workerHinweise(viele, [], "Richtwert", { labels: [] });
  assert.equal(h.split("\n").length, 15);
  assert.ok(h.endsWith("Richtwert"));
  assert.equal(workerHinweise([], [], null, { labels: [] }), "");
});

test("Kosten je Aufgabentyp und Richtwert", () => {
  const b = erstelleBericht(
    [ev({ status: "ok", issue: "SIN-1", cost: 0.4, labels: ["claude", "size:s"] }), ev({ status: "ok", issue: "SIN-2", cost: 0.6, labels: ["size:s"] }), ev({ status: "ok", cost: null })],
    [],
    jetzt,
  );
  assert.deepEqual(b.kosten, [{ typ: "size:s", laeufe: 2, durchschnittUsd: 0.5 }]);
  assert.match(kostenRichtwert(b.kosten, ["size:s"])!, /Ø 0\.50 \$ je Lauf, 2 Läufe/);
  assert.equal(kostenRichtwert(b.kosten, ["x"]), null);
});

test("Skill-Vorschlag erst ab 3 gleichen Abläufen", () => {
  const lauf = (i: string) => [ev({ issue: i, step: "work", status: "ok" }), ev({ issue: i, step: "build", status: "ok", created_at: "2026-10-12T02:00:00Z" })];
  assert.equal(skillVorschlaege([...lauf("A"), ...lauf("B")]).length, 0);
  assert.deepEqual(skillVorschlaege([...lauf("A"), ...lauf("B"), ...lauf("C")]), [{ name: "work-build", anzahl: 3 }]);
});

test("Index listet Lehren sortiert", () => {
  const i = lehrenIndex([leseLehre("docs/autonomy/lehren/b.md", "# B"), leseLehre("docs/autonomy/lehren/a.md", "# A")]);
  assert.ok(i.indexOf("[A]") < i.indexOf("[B]"));
});
