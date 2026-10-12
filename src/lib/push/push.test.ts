import assert from "node:assert/strict";
import { test } from "node:test";
import { TESTNACHRICHT, parseAbo, sendeAnAlle, sichereUrl, speichereAbo, type Abo, type Speicher } from "./push";

const abo = (n: number): Abo => ({ endpoint: `https://push.example.org/${n}`, p256dh: "k", auth: "a" });

function fakeSpeicher(start: Abo[] = []) {
  const abos = new Map(start.map((a) => [a.endpoint, a]));
  const speicher: Speicher = {
    async speichern(a) {
      abos.set(a.endpoint, a);
    },
    async loeschen(e) {
      abos.delete(e);
    },
    async alle() {
      return [...abos.values()];
    },
  };
  return { speicher, abos };
}

test("parseAbo nimmt ein gültiges Abo", () => {
  assert.deepEqual(parseAbo({ endpoint: "https://push.example.org/1", keys: { p256dh: "k", auth: "a" } }), { endpoint: "https://push.example.org/1", p256dh: "k", auth: "a" });
});

test("parseAbo lehnt ungültige Abos ab", () => {
  assert.equal(parseAbo(null), null);
  assert.equal(parseAbo({ endpoint: "http://push.example.org/1", keys: { p256dh: "k", auth: "a" } }), null);
  assert.equal(parseAbo({ endpoint: "kein-url", keys: { p256dh: "k", auth: "a" } }), null);
  assert.equal(parseAbo({ endpoint: "https://push.example.org/1", keys: { p256dh: "k" } }), null);
  assert.equal(parseAbo({ endpoint: "https://push.example.org/1" }), null);
});

test("speichereAbo speichert, überschreibt dasselbe Abo und weist Ungültiges ab", async () => {
  const { speicher, abos } = fakeSpeicher();
  const roh = { endpoint: "https://push.example.org/1", keys: { p256dh: "k", auth: "a" } };
  assert.equal(await speichereAbo(speicher, roh), true);
  assert.equal(await speichereAbo(speicher, { ...roh, keys: { p256dh: "k2", auth: "a" } }), true);
  assert.equal(abos.size, 1);
  assert.equal(abos.get(roh.endpoint)?.p256dh, "k2");
  assert.equal(await speichereAbo(speicher, { endpoint: "x" }), false);
  assert.equal(abos.size, 1);
});

test("sendeAnAlle löscht Abos bei 404 und 410, behält die übrigen", async () => {
  const { speicher, abos } = fakeSpeicher([abo(1), abo(2), abo(3), abo(4), abo(5)]);
  const status: Record<string, number> = { [abo(1).endpoint]: 201, [abo(2).endpoint]: 404, [abo(3).endpoint]: 410, [abo(4).endpoint]: 500 };
  const ergebnis = await sendeAnAlle(
    speicher,
    async (a) => {
      if (a.endpoint === abo(5).endpoint) throw new Error("netz");
      return status[a.endpoint];
    },
    TESTNACHRICHT,
  );
  assert.deepEqual(ergebnis, { gesendet: 1, entfernt: 2, fehler: 2 });
  assert.deepEqual([...abos.keys()], [abo(1).endpoint, abo(4).endpoint, abo(5).endpoint]);
});

test("sendeAnAlle ohne Abos sendet nichts", async () => {
  const { speicher } = fakeSpeicher();
  assert.deepEqual(await sendeAnAlle(speicher, async () => 201, TESTNACHRICHT), { gesendet: 0, entfernt: 0, fehler: 0 });
});

test("sichereUrl lässt nur Pfade der eigenen Seite zu", async () => {
  assert.equal(sichereUrl("/ablauf"), "/ablauf");
  assert.equal(sichereUrl("https://boese.example"), "/");
  assert.equal(sichereUrl("//boese.example"), "/");
  assert.equal(sichereUrl("/\\boese.example"), "/");
  assert.equal(sichereUrl(undefined), "/");
  const { speicher } = fakeSpeicher([abo(1)]);
  let gesehen = "";
  await sendeAnAlle(speicher, async (_a, n) => ((gesehen = n.url), 201), { ...TESTNACHRICHT, url: "https://boese.example" });
  assert.equal(gesehen, "/");
});
