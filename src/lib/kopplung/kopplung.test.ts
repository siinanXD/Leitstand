import assert from "node:assert/strict";
import { test } from "node:test";
import { CODE_GUELTIG_MS, MAX_FEHLER, SPERRFENSTER_MS, codeHash, erzeugeKopplung, kopplungsZeile, loeseKopplungEin, normalisiereCode, zufallsCode, type Speicher } from "./kopplung";

const GEHEIMNIS = "geheim";
const T0 = new Date("2026-10-12T10:00:00Z");

/** Speicher im Arbeitsspeicher, gleiche Regeln wie die Tabellen. */
function fakeSpeicher() {
  const codes = new Map<string, { tokenHash: string; ablauf: Date }>();
  let versuche: { id: number; zeit: Date }[] = [];
  let zaehler = 0;
  const speicher: Speicher = {
    async anlegen({ codeHash: h, tokenHash, ablauf }) {
      if (codes.has(h)) return false;
      codes.set(h, { tokenHash, ablauf });
      return true;
    },
    async einloesen(h, jetzt) {
      const z = codes.get(h);
      if (!z || z.ablauf <= jetzt) return null;
      codes.delete(h);
      return z.tokenHash;
    },
    async versuch(jetzt) {
      const id = ++zaehler;
      versuche.push({ id, zeit: jetzt });
      const anzahl = versuche.filter((v) => v.zeit.getTime() >= jetzt.getTime() - SPERRFENSTER_MS).length;
      return { anzahl, zurueck: async () => void (versuche = versuche.filter((v) => v.id !== id)) };
    },
    async aufraeumen(jetzt) {
      for (const [h, z] of codes) if (z.ablauf <= jetzt) codes.delete(h);
    },
  };
  return { speicher, codes };
}

test("zufallsCode und normalisiereCode: 6 Ziffern, Leerzeichen erlaubt", () => {
  assert.match(zufallsCode(), /^\d{6}$/);
  assert.equal(normalisiereCode("123 456"), "123456");
  assert.equal(normalisiereCode(" 012345 "), "012345");
  assert.equal(normalisiereCode("12345"), null);
  assert.equal(normalisiereCode("12345a"), null);
  assert.equal(normalisiereCode(123456), null);
});

test("Code erzeugen: nur der Hash wird gespeichert, 10 Minuten gültig", async () => {
  const { speicher, codes } = fakeSpeicher();
  const k = await erzeugeKopplung(speicher, "tok", GEHEIMNIS, T0, () => "123456");
  assert.equal(k?.code, "123456");
  assert.equal(k?.gueltigBis.getTime(), T0.getTime() + CODE_GUELTIG_MS);
  assert.deepEqual([...codes.keys()], [codeHash("123456", GEHEIMNIS)]);
  assert.notEqual(codeHash("123456", GEHEIMNIS), "123456");
  assert.notEqual(codeHash("123456", GEHEIMNIS), codeHash("123456", "anderes"));
});

test("Code erzeugen: bei Kollision neuer Zufallscode, am Ende null", async () => {
  const { speicher } = fakeSpeicher();
  await erzeugeKopplung(speicher, "a", GEHEIMNIS, T0, () => "111111");
  const folge = ["111111", "222222"];
  assert.equal((await erzeugeKopplung(speicher, "b", GEHEIMNIS, T0, () => folge.shift() ?? "222222"))?.code, "222222");
  assert.equal(await erzeugeKopplung(speicher, "c", GEHEIMNIS, T0, () => "111111"), null);
});

test("einlösen: richtiger Code liefert token_hash", async () => {
  const { speicher } = fakeSpeicher();
  await erzeugeKopplung(speicher, "tok", GEHEIMNIS, T0, () => "123456");
  assert.deepEqual(await loeseKopplungEin(speicher, "123 456", GEHEIMNIS, new Date(T0.getTime() + 60_000)), { ok: true, tokenHash: "tok" });
});

test("einlösen: abgelaufen", async () => {
  const { speicher } = fakeSpeicher();
  await erzeugeKopplung(speicher, "tok", GEHEIMNIS, T0, () => "123456");
  const spaeter = new Date(T0.getTime() + CODE_GUELTIG_MS + 1000);
  assert.deepEqual(await loeseKopplungEin(speicher, "123456", GEHEIMNIS, spaeter), { ok: false, grund: "ungueltig" });
});

test("einlösen: doppelt eingelöst scheitert", async () => {
  const { speicher } = fakeSpeicher();
  await erzeugeKopplung(speicher, "tok", GEHEIMNIS, T0, () => "123456");
  assert.equal((await loeseKopplungEin(speicher, "123456", GEHEIMNIS, T0)).ok, true);
  assert.deepEqual(await loeseKopplungEin(speicher, "123456", GEHEIMNIS, T0), { ok: false, grund: "ungueltig" });
});

test("einlösen: falsches Format geht gar nicht an den Speicher", async () => {
  const { speicher } = fakeSpeicher();
  let aufrufe = 0;
  const zaehlend: Speicher = { ...speicher, versuch: async (j) => (aufrufe++, speicher.versuch(j)) };
  assert.deepEqual(await loeseKopplungEin(zaehlend, "12", GEHEIMNIS, T0), { ok: false, grund: "format" });
  assert.equal(aufrufe, 0);
});

test("Sperre nach 5 Fehlern: auch der richtige Code hilft dann nicht, nach dem Fenster geht es wieder", async () => {
  const { speicher } = fakeSpeicher();
  await erzeugeKopplung(speicher, "tok", GEHEIMNIS, T0, () => "123456");
  for (let i = 0; i < MAX_FEHLER; i++) assert.deepEqual(await loeseKopplungEin(speicher, "000000", GEHEIMNIS, T0), { ok: false, grund: "ungueltig" });
  assert.deepEqual(await loeseKopplungEin(speicher, "123456", GEHEIMNIS, T0), { ok: false, grund: "gesperrt" });
  const spaeter = new Date(T0.getTime() + SPERRFENSTER_MS + 1000);
  await erzeugeKopplung(speicher, "tok2", GEHEIMNIS, spaeter, () => "654321");
  assert.deepEqual(await loeseKopplungEin(speicher, "654321", GEHEIMNIS, spaeter), { ok: true, tokenHash: "tok2" });
});

test("Erfolg zählt nicht als Fehlversuch", async () => {
  const { speicher } = fakeSpeicher();
  for (let i = 0; i < 10; i++) {
    await erzeugeKopplung(speicher, "tok", GEHEIMNIS, T0, () => "123456");
    assert.equal((await loeseKopplungEin(speicher, "123456", GEHEIMNIS, T0)).ok, true);
  }
});

test("kopplungsZeile: Schritt kopplung für loop_events", () => {
  assert.deepEqual(kopplungsZeile("ok"), { project: "leitstand", step: "kopplung", status: "ok", issue: null, pr: null });
});
