import assert from "node:assert/strict";
import { test } from "node:test";
import { hoereAufEreignisse, mitEreignis, type Echtzeitquelle } from "./echtzeit";
import { parseEvents, type Quelle } from "./uebersicht";
import { stationen } from "./uebersicht-einfach";

const jetzt = new Date("2026-10-12T12:00:00Z");

/** Realtime-Mock: merkt sich den Rückruf und lässt Tests Zeilen einspielen. */
function mock() {
  let rueckruf: ((n: { new: unknown }) => void) | null = null;
  let filter: unknown = null;
  let entfernt = 0;
  const kanal = {
    on(_art: "postgres_changes", f: unknown, r: (n: { new: unknown }) => void) {
      filter = f;
      rueckruf = r;
      return kanal;
    },
    subscribe: () => kanal,
  };
  const client: Echtzeitquelle = { channel: () => kanal, removeChannel: () => void entfernt++ };
  return { client, senden: (zeile: unknown) => rueckruf?.({ new: zeile }), filter: () => filter, entfernt: () => entfernt };
}

test("neuer loop_events-Eintrag wandert ohne Neuladen in die richtige Station", () => {
  const m = mock();
  let quelle: Quelle = { events: parseEvents([{ id: "1", created_at: "2026-10-12T11:50:00Z", project: "leitstand", step: "dispatch", status: "ok", issue: "SIN-1" }]), snapshot: [] };
  const abmelden = hoereAufEreignisse(m.client, (e) => (quelle = mitEreignis(quelle, e)));
  assert.deepEqual(m.filter(), { event: "INSERT", schema: "public", table: "loop_events" });

  const station = (id: string) => stationen(quelle, [], jetzt).find((s) => s.id === id)!.eintraege.map((e) => e.titel);
  assert.deepEqual(station("geplant"), ["SIN-1"]);

  m.senden({ id: "2", created_at: "2026-10-12T11:58:00Z", project: "leitstand", step: "worker", status: "start", issue: "SIN-1" });
  assert.deepEqual(station("geplant"), []);
  assert.deepEqual(station("gebaut"), ["SIN-1"]);
  assert.equal(stationen(quelle, [], jetzt).find((s) => s.id === "gebaut")!.eintraege[0].aktiv, true);

  abmelden();
  assert.equal(m.entfernt(), 1);
});

test("Doppelte id und unlesbare Zeilen ändern nichts", () => {
  const m = mock();
  let quelle: Quelle = { events: [], snapshot: [] };
  hoereAufEreignisse(m.client, (e) => (quelle = mitEreignis(quelle, e)));
  const zeile = { id: "9", created_at: "2026-10-12T11:58:00Z", project: "leitstand", step: "worker", status: "start", issue: "SIN-2" };
  m.senden(zeile);
  m.senden(zeile);
  m.senden({ kaputt: true });
  m.senden(null);
  assert.equal(quelle.events.length, 1);
});
