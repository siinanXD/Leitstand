import assert from "node:assert/strict";
import { test } from "node:test";
import { eingangDateien, notizPfad, notizUrl, zuSchliessen, type EingangIssue } from "./eingang";
import { mitGeheimnis } from "./gedaechtnis";

const issue = (o: Partial<EingangIssue> = {}): EingangIssue => ({ id: "a", identifier: "SIN-700", title: "Thema [x]", description: "## Entscheidungen\n- nur 3 Repos\nsiehe SIN-701", url: "https://linear.app/x/SIN-700", createdAt: "2026-10-14T22:30:00Z", stateType: "unstarted", ...o });

test("Notiz mit Datum (Berlin), Art, Linear-Link und Verweis auf andere Notiz", () => {
  const d = eingangDateien([issue(), issue({ id: "b", identifier: "SIN-701", description: "Eine Idee" })]);
  const t = d["Gespräche/SIN-700.md"];
  assert.match(t, /^---\ntyp: entscheidung\nprodukt: alle\nstatus: gilt\ndatum: 2026-10-15\n/);
  assert.match(t, /beschreibung: Thema x\n/);
  assert.match(t, /# SIN-700: Thema x #entscheidung/);
  assert.match(t, /Linear: https:\/\/linear\.app\/x\/SIN-700/);
  assert.match(t, /\[\[Gespräche\/SIN-701\]\]/);
  assert.match(d["Gespräche/SIN-701.md"], /typ: idee\nprodukt: alle\nstatus: neu/);
});

test("Änderung am Issue überschreibt dieselbe Datei, kein Doppel", () => {
  const a = eingangDateien([issue()]);
  const b = eingangDateien([issue({ title: "Neuer Titel", description: "geändert" })]);
  assert.deepEqual(Object.keys(a), Object.keys(b));
  assert.match(b["Gespräche/SIN-700.md"], /Neuer Titel/);
});

test("abgebrochene Issues fallen weg, erledigte werden nicht erneut geschlossen", () => {
  const liste = [issue({ stateType: "canceled" }), issue({ identifier: "SIN-702", stateType: "completed" }), issue({ identifier: "SIN-703" })];
  assert.deepEqual(Object.keys(eingangDateien(liste)).sort(), ["Gespräche/SIN-702.md", "Gespräche/SIN-703.md"]);
  assert.deepEqual(zuSchliessen(liste).map((i) => i.identifier), ["SIN-703"]);
});

test("Link auf die Notiz und Geheimnisprüfung", () => {
  assert.equal(notizPfad("SIN-7/../x"), "Gespräche/SIN-7----x.md");
  assert.equal(notizUrl("SIN-700"), "https://github.com/siinanXD/gedaechtnis/blob/main/Gespr%C3%A4che/SIN-700.md");
  assert.deepEqual(mitGeheimnis(eingangDateien([issue({ description: "key: ghp_abcdefghijklmnopqrstuvwxyz" })])), ["Gespräche/SIN-700.md"]);
});
