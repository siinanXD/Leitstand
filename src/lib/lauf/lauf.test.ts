import assert from "node:assert/strict";
import { test } from "node:test";
import { nimmAn, pruefsumme, SCHEMA_VERSION, type Lauf, type Speicher } from "./lauf";

const ergebnis = {
  rolle: "bauen", issue: "SIN-836", zeitpunkt: "2026-10-19T03:00:00Z", status: "fertig", zusammenfassung: "x",
  naechster_schritt: "y", kosten_eur: 0, quellen: [], art: "code", pr: "#1", geaendert: ["a.ts"],
};
const huelle = (o: object = {}) =>
  JSON.stringify({ run_id: "lauf-0001", agent: "bauen", issue: "SIN-836", schema_version: SCHEMA_VERSION, result: ergebnis, artifacts: [], kosten_eur: 0, zeitpunkt: "2026-10-19T03:00:00Z", ...o });

function fake(ausfall: { speichern?: boolean; bestaetigen?: number } = {}) {
  const db = new Map<string, Lauf>();
  const verworfen: { code: string }[] = [];
  let bestaetigungsFehler = ausfall.bestaetigen ?? 0;
  const s: Speicher = {
    holen: async (id) => db.get(id) ?? null,
    speichern: async (l) => {
      if (ausfall.speichern) throw new Error("Storage fehlt");
      if (!db.has(l.run_id)) db.set(l.run_id, l);
    },
    bestaetigen: async (id) => {
      if (bestaetigungsFehler-- > 0) throw new Error("Absturz");
      const l = db.get(id)!;
      if (l.status === "completed") return false;
      db.set(id, { ...l, status: "completed" });
      return true;
    },
    verwerfen: async (e) => void verworfen.push(e),
  };
  return { s, db, verworfen };
}

test("Kaputtes JSON wird abgelehnt und mit Rohoutput protokolliert", async () => {
  const { s, db, verworfen } = fake();
  const a = await nimmAn("{kaputt", s);
  assert.equal(a.code, "json_ungueltig");
  assert.equal(a.folgestart, false);
  assert.equal(db.size, 0);
  assert.equal(verworfen.length, 1);
});

test("Ergebnis gegen das Rollen-Schema: falsches Feld wird abgelehnt", async () => {
  const { s, db } = fake();
  const a = await nimmAn(huelle({ result: { ...ergebnis, status: "irgendwas" } }), s);
  assert.equal(a.code, "schema_ungueltig");
  assert.match(a.fehler[0], /^\$\.result\.status/);
  assert.equal(db.size, 0);
});

test("Gültiger Lauf ist abrufbar, completed und startet genau einen Folgeschritt", async () => {
  const { s, db } = fake();
  const a = await nimmAn(huelle(), s);
  assert.deepEqual([a.code, a.folgestart], ["ok", true]);
  assert.equal(db.get("lauf-0001")?.status, "completed");
  assert.equal(db.get("lauf-0001")?.pruefsumme, pruefsumme(ergebnis));
});

test("Wiederholter Callback ergibt einen Datensatz und keinen zweiten Folgestart", async () => {
  const { s, db } = fake();
  await nimmAn(huelle(), s);
  const b = await nimmAn(huelle(), s);
  assert.deepEqual([b.code, b.folgestart], ["bereits_gespeichert", false]);
  assert.equal(db.size, 1);
});

test("Absturz zwischen Speichern und Bestätigen: Wiederholung bestätigt, genau ein Datensatz", async () => {
  const { s, db } = fake({ bestaetigen: 1 });
  const a = await nimmAn(huelle(), s);
  assert.deepEqual([a.code, a.folgestart], ["speicher_fehler", false]);
  assert.equal(db.get("lauf-0001")?.status, "validiert");
  const b = await nimmAn(huelle(), s);
  assert.deepEqual([b.code, b.folgestart], ["ok", true]);
  assert.equal(db.size, 1);
});

test("Fehlendes Storage: kein completed, kein Folgestart, Auditspur", async () => {
  const { s, db, verworfen } = fake({ speichern: true });
  const a = await nimmAn(huelle(), s);
  assert.deepEqual([a.code, a.folgestart], ["speicher_fehler", false]);
  assert.equal(db.size, 0);
  assert.equal(verworfen[0].code, "speicher_fehler");
});

test("Gleiche run_id mit anderem Ergebnis überschreibt nichts", async () => {
  const { s, db } = fake();
  await nimmAn(huelle(), s);
  const a = await nimmAn(huelle({ result: { ...ergebnis, zusammenfassung: "anders" } }), s);
  assert.equal(a.code, "konflikt");
  assert.equal(db.get("lauf-0001")?.result.zusammenfassung, "x");
});
