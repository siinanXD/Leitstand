import assert from "node:assert/strict";
import { test } from "node:test";
import { dateien, type Eingabe } from "./gedaechtnis";
import { abschliessen, eigenschaften, istSonntag, logAnhaengen, pruefe } from "./vault";

const kopf = (typ: string, status: string, datum = "2026-10-01") => `---\ntyp: ${typ}\nprodukt: leitstand\nstatus: ${status}\ndatum: ${datum}\nquelle: x\nbeschreibung: b\n---\n`;
const jetzt = new Date("2026-10-18T05:00:00Z"); // Sonntag

test("Notiz ohne Pflicht-Eigenschaften wird erkannt", () => {
  const b = pruefe({ "Ideen/a.md": "---\ntyp: idee\nstatus: neu\n---\n# a\n", "Ideen/b.md": "# ohne Kopf\n" }, jetzt).filter((x) => x.art === "eigenschaft");
  assert.deepEqual(b.map((x) => x.pfad), ["Ideen/a.md", "Ideen/b.md"]);
  assert.match(b[0].text, /produkt, datum, quelle, beschreibung/);
  assert.deepEqual(Object.keys(eigenschaften(kopf("idee", "neu"))), ["typ", "produkt", "status", "datum", "quelle", "beschreibung"]);
});

test("Wochen-Check: kaputte Links, unverlinkte Notizen, Widerspruch, alte Ideen", () => {
  const d = {
    "00 Wo stehen wir.md": `${kopf("uebersicht", "aktuell")}[[Entscheidungen/neu]] [[Gibt es nicht]]`,
    "Entscheidungen/alt.md": `${kopf("entscheidung", "gilt")}alt`,
    "Entscheidungen/neu.md": `${kopf("entscheidung", "gilt")}Ersetzt: [[Entscheidungen/alt]]`,
    "Ideen/alt.md": `${kopf("idee", "neu", "2026-08-01")}alt`,
    "Ideen/frisch.md": `${kopf("idee", "neu", "2026-10-10")}[[Ideen/alt]]`,
  };
  const art = (a: string) => pruefe(d, jetzt).filter((x) => x.art === a).map((x) => x.pfad);
  assert.deepEqual(art("link"), ["00 Wo stehen wir.md"]);
  assert.deepEqual(art("unverlinkt"), ["Ideen/frisch.md"]);
  assert.deepEqual(art("widerspruch"), ["Entscheidungen/neu.md"]);
  assert.deepEqual(art("idee-alt"), ["Ideen/alt.md"]);
});

test("Lauf: index.md, log.md, Regeldatei, 3 Ansichten; Wochen-Check nur sonntags im Tagesbericht", () => {
  const e: Eingabe = { jetzt, produkte: [{ id: "leitstand", name: "Leitstand", ziel: "", fertig: 1, gesamt: 2, laeuft: [], sinan: [] }], prs: [], entscheidungen: [], offen: [], kostenUsd: null, probleme: [] };
  assert.ok(istSonntag(jetzt) && !istSonntag(new Date("2026-10-19T05:00:00Z")));
  const sonntag = abschliessen({}, dateien(e), jetzt);
  assert.match(sonntag.dateien["index.md"], /\[\[Produkte\/Leitstand\]\] · Ziel, Stand und Entscheidungen zu Leitstand/);
  assert.match(sonntag.dateien["log.md"], /- 2026-10-18 · gedaechtnis-agent · \d+ Notizen, Wochen-Check: \d+ Befunde/);
  assert.match(sonntag.dateien["Tage/2026-10-18.md"], /## Wochen-Check\n/);
  assert.ok(sonntag.dateien["CLAUDE.md"] && Object.keys(sonntag.dateien).filter((p) => p.endsWith(".base")).length === 3);
  const montag = new Date("2026-10-19T05:00:00Z");
  const wochentag = abschliessen({}, dateien({ ...e, jetzt: montag }), montag);
  assert.ok(!wochentag.dateien["Tage/2026-10-19.md"].includes("Wochen-Check") && wochentag.befunde === null);
});

test("Protokoll: nur anhängen, gleiche Zeile nicht doppelt", () => {
  const a = logAnhaengen(undefined, jetzt, "3 Notizen");
  assert.equal(logAnhaengen(a, jetzt, "3 Notizen"), a);
  assert.equal(logAnhaengen(a, jetzt, "4 Notizen").split("\n").filter((z) => z.startsWith("- ")).length, 2);
});
