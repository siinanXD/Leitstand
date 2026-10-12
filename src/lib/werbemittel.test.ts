import assert from "node:assert/strict";
import { test } from "node:test";
import { entscheide, leseEingabe, protokollZeile, type Aenderung, type Speicher } from "./werbemittel";

const ID = "123e4567-e89b-42d3-a456-426614174000";

function speicher(zeilen: Map<string, string>, log: Aenderung[] = []): Speicher {
  return {
    async setze(id, von, aenderung) {
      if (zeilen.get(id) !== von) return false;
      zeilen.set(id, aenderung.status);
      log.push(aenderung);
      return true;
    },
  };
}

test("Freigeben setzt freigegeben mit Zeitstempel", async () => {
  const z = new Map([[ID, "wartet_auf_freigabe"]]);
  const log: Aenderung[] = [];
  const e = await entscheide(speicher(z, log), ID, { aktion: "freigeben" }, new Date("2026-10-13T08:00:00Z"));
  assert.deepEqual(e, { ok: true, status: "freigegeben" });
  assert.deepEqual(log, [{ status: "freigegeben", freigegeben_at: "2026-10-13T08:00:00.000Z" }]);
  assert.equal(z.get(ID), "freigegeben");
});

test("Ablehnen setzt abgelehnt mit Grund", async () => {
  const z = new Map([[ID, "wartet_auf_freigabe"]]);
  const log: Aenderung[] = [];
  assert.deepEqual(await entscheide(speicher(z, log), ID, { aktion: "ablehnen", grund: "Ton zu leise" }), { ok: true, status: "abgelehnt" });
  assert.deepEqual(log, [{ status: "abgelehnt", ablehnungsgrund: "Ton zu leise" }]);
});

test("Wechsel nur aus wartet_auf_freigabe, auch nicht doppelt", async () => {
  for (const status of ["freigegeben", "abgelehnt", "veroeffentlicht"]) {
    const z = new Map([[ID, status]]);
    assert.deepEqual(await entscheide(speicher(z), ID, { aktion: "freigeben" }), { ok: false, grund: "nicht-wartend" });
    assert.deepEqual(await entscheide(speicher(z), ID, { aktion: "ablehnen", grund: "x" }), { ok: false, grund: "nicht-wartend" });
    assert.equal(z.get(ID), status);
  }
});

test("Speicherfehler wird zu ok:false und protokolliert als fehler", async () => {
  const e = await entscheide({ setze: async () => Promise.reject(new Error("db")) }, ID, { aktion: "freigeben" });
  assert.deepEqual(e, { ok: false, grund: "speicher" });
  assert.equal(protokollZeile(e).status, "fehler");
  assert.equal(protokollZeile({ ok: true, status: "abgelehnt" }).step, "werbemittel-ablehnung");
  assert.equal(protokollZeile({ ok: true, status: "freigegeben" }).step, "werbemittel-freigabe");
});

test("Eingabe: Ablehnen braucht Grund, id muss UUID sein", () => {
  assert.deepEqual(leseEingabe({ id: ID, aktion: "freigeben" }), { id: ID, aktion: { aktion: "freigeben" } });
  assert.deepEqual(leseEingabe({ id: ID, aktion: "ablehnen", grund: "  zu lang  " }), { id: ID, aktion: { aktion: "ablehnen", grund: "zu lang" } });
  assert.equal(leseEingabe({ id: ID, aktion: "ablehnen" }), null);
  assert.equal(leseEingabe({ id: ID, aktion: "ablehnen", grund: "   " }), null);
  assert.equal(leseEingabe({ id: ID, aktion: "ablehnen", grund: "x".repeat(1001) }), null);
  assert.equal(leseEingabe({ id: ID, aktion: "veroeffentlichen" }), null);
  assert.equal(leseEingabe({ id: "1 or 1=1", aktion: "freigeben" }), null);
  assert.equal(leseEingabe(null), null);
});
