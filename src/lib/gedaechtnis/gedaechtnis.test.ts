import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_ZEILEN_TAG, MAX_ZEILEN_UEBERSICHT, aktualisiertSatz, dateien, mitGeheimnis, tagBerlin, type Eingabe } from "./gedaechtnis";

const jetzt = new Date("2026-10-13T04:00:00Z");
const zeilen = (t: string) => t.trimEnd().split("\n").length;

const fixture: Eingabe = {
  jetzt,
  produkte: [
    { id: "lernapp", name: "Lern-App", ziel: "Kurse für Schüler", fertig: 3, gesamt: 10, laeuft: ["SIN-1 Kurs-Editor"], sinan: ["Freigabe PR 5"] },
    { id: "leitstand", name: "Leitstand", ziel: "Überblick über den Loop", fertig: 8, gesamt: 12, laeuft: [], sinan: [] },
  ],
  prs: [{ nummer: 70, titel: "docs(agenten): Ponytail (SIN-508)", projekt: "leitstand", url: "https://github.com/siinanXD/Leitstand/pull/70" }],
  entscheidungen: [{ id: "SIN-508", projekt: "leitstand", titel: "Stand-Agent", url: "https://github.com/siinanXD/Leitstand/blob/main/docs/decisions/SIN-508-stand-agent.md" }],
  offen: [{ titel: "Vercel-Variablen eintragen", projekt: "leitstand", url: "https://linear.app/x", art: "sinan" }],
  kostenUsd: 1.234,
  probleme: [],
};

test("Trockenlauf mit Fixture erzeugt alle 5 Dateitypen mit Frontmatter", () => {
  const d = dateien(fixture);
  assert.deepEqual(Object.keys(d).sort(), ["00 Wo stehen wir.md", "Entscheidungen/SIN-508.md", "Offen.md", "Produkte/Leitstand.md", "Produkte/Lern-App.md", "Tage/2026-10-13.md"]);
  for (const text of Object.values(d)) assert.match(text, /^---\ntyp: \w+\nprodukt: .+\ndatum: 2026-10-13\nquelle: .+\n---\n/);
  assert.match(d["00 Wo stehen wir.md"], /#produkt\/lernapp/);
  assert.match(d["Produkte/Lern-App.md"], /3\/10 fertig/);
  assert.match(d["Produkte/Leitstand.md"], /\[\[Entscheidungen\/SIN-508\]\]/);
  assert.match(d["Tage/2026-10-13.md"], /#70 docs/);
  assert.match(d["Offen.md"], /\[Vercel-Variablen eintragen\]\(https:\/\/linear\.app\/x\)/);
});

test("Wo stehen wir: je Produkt 3 Zeilen, höchstens 25 Zeilen auch bei vielen Produkten", () => {
  const viele = { ...fixture, produkte: Array.from({ length: 12 }, (_, i) => ({ ...fixture.produkte[0], id: `p${i}`, name: `Produkt ${i}`, laeuft: ["a", "b", "c"] })) };
  assert.ok(zeilen(dateien(fixture)["00 Wo stehen wir.md"]) <= MAX_ZEILEN_UEBERSICHT);
  const text = dateien(viele)["00 Wo stehen wir.md"];
  assert.ok(zeilen(text) <= MAX_ZEILEN_UEBERSICHT);
  assert.match(text, /nur unter Produkte\//);
});

test("Tag: höchstens 30 Zeilen, auch mit sehr vielen PRs und Problemen", () => {
  const prs = Array.from({ length: 60 }, (_, i) => ({ nummer: i, titel: "x\ny", projekt: "leitstand", url: "u" }));
  const text = dateien({ ...fixture, prs, probleme: Array.from({ length: 40 }, (_, i) => `Problem ${i}`) })["Tage/2026-10-13.md"];
  assert.ok(zeilen(text) <= MAX_ZEILEN_TAG);
  assert.match(text, /und \d+ weitere/);
  assert.ok(!text.includes("x\ny"));
});

test("Produktseite zeigt höchstens 10 Entscheidungen; Dateinamen sind sicher", () => {
  const entscheidungen = Array.from({ length: 15 }, (_, i) => ({ id: `SIN-${i}`, projekt: "leitstand", titel: "t", url: "u" }));
  const d = dateien({ ...fixture, entscheidungen, produkte: [{ ...fixture.produkte[1], name: "../Böse/Name" }] });
  assert.equal(d["Produkte/..-Böse-Name.md"].match(/\[\[Entscheidungen\//g)?.length, 10);
  assert.ok(Object.keys(d).every((p) => !p.includes("..") || p.includes("..-")));
});

test("Geheimnisse werden erkannt, normale Seiten nicht", () => {
  assert.deepEqual(mitGeheimnis(dateien(fixture)), []);
  assert.deepEqual(mitGeheimnis({ "a.md": "token ghp_abcdefghijklmnopqrstuvwxyz1234", "b.md": "alles gut" }), ["a.md"]);
  // Wörter mit „sk-“ oder „api-key“ ohne Wert sind keine Geheimnisse (Dateinamen wie SIN-397-run-task-pr.md).
  assert.deepEqual(mitGeheimnis({ "c.md": "https://github.com/x/y/blob/main/docs/decisions/SIN-397-run-task-pr.md risk-gate api-key fehlt" }), []);
  assert.deepEqual(mitGeheimnis({ "d.md": "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789" }), ["d.md"]);
});

test("Berliner Tag und Kachel-Satz", () => {
  assert.equal(tagBerlin(new Date("2026-10-12T23:30:00Z")), "2026-10-13");
  assert.match(aktualisiertSatz("2026-10-13T03:50:00Z"), /^Zuletzt aktualisiert am 13\.10\.2026 um 05:50 Uhr$/);
  assert.equal(aktualisiertSatz(null), "Noch nicht geschrieben");
});
