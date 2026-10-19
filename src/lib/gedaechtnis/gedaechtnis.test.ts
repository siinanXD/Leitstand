import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_ZEILEN_TAG, MAX_ZEILEN_UEBERSICHT, aktualisiertSatz, ceoZeilen, dateien, mitGeheimnis, tagBerlin, vereinige, type Eingabe } from "./gedaechtnis";
import { pruefe } from "./vault";

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

test("Entscheidungen verlinken die tatsächlichen Produktdateien; unbekannte Produkte erfinden keinen Link", () => {
  const d = dateien({ ...fixture, entscheidungen: [
    ...fixture.entscheidungen,
    { id: "SIN-1", projekt: "lernapp", titel: "Quelle", url: "https://example.invalid/1" },
    { id: "SIN-2", projekt: "unbekannt", titel: "Quelle", url: "https://example.invalid/2" },
  ] });
  assert.match(d["Entscheidungen/SIN-508.md"], /\[\[Produkte\/Leitstand\]\]/);
  assert.match(d["Entscheidungen/SIN-1.md"], /\[\[Produkte\/Lern-App\]\]/);
  assert.ok(!d["Entscheidungen/SIN-2.md"].includes("[[Produkte/"));
  assert.deepEqual(pruefe(d, jetzt).filter((b) => b.art === "link"), []);
});

test("Trockenlauf mit Fixture erzeugt alle 5 Dateitypen mit Frontmatter", () => {
  const d = dateien(fixture);
  assert.deepEqual(Object.keys(d).sort(), ["00 Wo stehen wir.md", "Entscheidungen/SIN-508.md", "Offen.md", "Produkte/Leitstand.md", "Produkte/Lern-App.md", "Tage/2026-10-13.md"]);
  for (const text of Object.values(d)) assert.match(text, /^---\ntyp: \w+\nprodukt: .+\nstatus: \w+\ndatum: 2026-10-13\nquelle: .+\nbeschreibung: .+\n---\n/);
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

test("Tag: Trends (SIN-575) als Abschnitt mit höchstens 3 Zeilen, ohne Trends kein Abschnitt", () => {
  const trends = Array.from({ length: 5 }, (_, i) => `- Repo ${i}: nächste Version (leitstand)`);
  const prs = Array.from({ length: 60 }, (_, i) => ({ nummer: i, titel: "x", projekt: "leitstand", url: "u" }));
  const text = dateien({ ...fixture, prs, trends })["Tage/2026-10-13.md"];
  assert.match(text, /## Trends\n- Repo 0.*\n- Repo 1.*\n- Repo 2.*\n/);
  assert.ok(!text.includes("Repo 3"));
  assert.ok(zeilen(text) <= MAX_ZEILEN_TAG);
  assert.ok(!dateien(fixture)["Tage/2026-10-13.md"].includes("## Trends"));
});

test("Tag: CEO-Entscheidung je Produkt (SIN-636) als Abschnitt, ohne CEO kein Abschnitt", () => {
  const ceo = ceoZeilen([{ produkt: "leitstand", entscheidung: "weiterbauen", grund: "Fertig-Punkte sind offen." }, { produkt: "lernapp", entscheidung: "warten", grund: "Freigabe fehlt." }]);
  const prs = Array.from({ length: 60 }, (_, i) => ({ nummer: i, titel: "x", projekt: "leitstand", url: "u" }));
  const text = dateien({ ...fixture, prs, ceo })["Tage/2026-10-13.md"];
  assert.match(text, /## CEO\n- leitstand: weiterbauen\. Fertig-Punkte sind offen\.\n- lernapp: warten\. Freigabe fehlt\.\n/);
  assert.ok(zeilen(text) <= MAX_ZEILEN_TAG);
  assert.ok(!dateien(fixture)["Tage/2026-10-13.md"].includes("## CEO"));
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

test("Offen (SIN-614): offene sinan-Issues aus Linear → Offen.md nicht leer, Snapshot-Dubletten fallen weg", () => {
  const linear = ["SIN-336", "SIN-337", "SIN-338", "SIN-342", "SIN-594"].map((id) => ({ titel: `${id} Aufgabe`, projekt: "Leitstand", url: `https://linear.app/${id}`, art: "sinan" as const }));
  const offen = vereinige(linear, [{ titel: "SIN-336 Aufgabe", projekt: "leitstand", url: null, art: "sinan" }, { titel: "PR #5 Freigabe", projekt: "lernapp", url: "u", art: "freigabe" }]);
  assert.equal(offen.length, 6);
  const text = dateien({ ...fixture, offen })["Offen.md"];
  assert.ok(!text.includes("Nichts offen"));
  assert.equal(text.match(/\(https:\/\/linear\.app\/SIN-\d+\)/g)?.length, 5);
});

test("Fehlende Quelle (SIN-614): „Quelle nicht erreichbar“ statt „nichts“", () => {
  const kaputt: Eingabe = {
    ...fixture,
    offen: [],
    prs: null,
    erledigt: null,
    fehlt: ["Linear", "Supabase", "GitHub"],
    produkte: [{ id: "leitstand", name: "Leitstand", ziel: "", fertig: null, gesamt: null, laeuft: null, sinan: null }],
  };
  const d = dateien(kaputt);
  assert.ok(!d["Offen.md"].includes("Nichts offen"));
  assert.match(d["Offen.md"], /Quelle nicht erreichbar: Linear, Supabase/);
  assert.match(d["00 Wo stehen wir.md"], /Quelle nicht erreichbar\nDu: Quelle nicht erreichbar|Läuft: Quelle nicht erreichbar/);
  assert.ok(!d["00 Wo stehen wir.md"].includes("Stand unbekannt") && !d["00 Wo stehen wir.md"].includes("nichts"));
  const tag = d["Tage/2026-10-13.md"];
  assert.match(tag, /Quelle nicht erreichbar \(GitHub\)/);
  assert.match(tag, /Quelle nicht erreichbar \(Linear\)/);
  assert.ok(!tag.includes("Nichts gemergt"));
});

test("Tag (SIN-614): in Linear erledigte Issues, höchstens 30 Zeilen", () => {
  const erledigt = Array.from({ length: 40 }, (_, i) => ({ id: `SIN-${i}`, titel: "t" }));
  const prs = Array.from({ length: 60 }, (_, i) => ({ nummer: i, titel: "x", projekt: "leitstand", url: "u" }));
  const text = dateien({ ...fixture, prs, erledigt, probleme: Array.from({ length: 40 }, (_, i) => `P ${i}`) })["Tage/2026-10-13.md"];
  assert.match(text, /## In Linear erledigt\n- SIN-0 t/);
  assert.ok(zeilen(text) <= MAX_ZEILEN_TAG);
});

test("Berliner Tag und Kachel-Satz", () => {
  assert.equal(tagBerlin(new Date("2026-10-12T23:30:00Z")), "2026-10-13");
  assert.match(aktualisiertSatz("2026-10-13T03:50:00Z"), /^Zuletzt aktualisiert am 13\.10\.2026 um 05:50 Uhr$/);
  assert.equal(aktualisiertSatz(null), "Noch nicht geschrieben");
});
