import assert from "node:assert/strict";
import { test } from "node:test";
import { stelleKontoSicher, type KontoClient } from "./sitzung";

function konto(createFehler: string | null, vorhanden: { id: string; email: string }[], seiten?: { id: string; email: string }[][]) {
  const log: string[] = [];
  const client: KontoClient = {
    auth: {
      admin: {
        createUser: async (a) => (log.push(`create:${a.app_metadata.agent_testnutzer}`), createFehler ? { data: null, error: { message: createFehler } } : { data: { user: { id: "neu" } }, error: null }),
        listUsers: async ({ page }) => (log.push(`list:${page}`), { data: { users: seiten ? (seiten[page - 1] ?? []) : vorhanden }, error: null }),
        updateUserById: async (id, a) => (log.push(`update:${id}:${a.app_metadata.agent_testnutzer}`), { error: null }),
      },
    },
    from: () => ({ upsert: async (row) => (log.push(`upsert:${row.user_id}`), { error: null }) }),
  };
  return { client, log };
}

test("neues Konto: Marker beim Anlegen, Upsert", async () => {
  const { client, log } = konto(null, []);
  assert.equal(await stelleKontoSicher(client, "a@b.c"), "neu");
  assert.deepEqual(log, ["create:true", "upsert:neu"]);
});

test("vorhandenes Konto: Id per listUsers, Marker und Upsert immer gesetzt", async () => {
  const { client, log } = konto("User already registered", [{ id: "x", email: "andere@b.c" }, { id: "alt", email: "A@B.C" }]);
  assert.equal(await stelleKontoSicher(client, "a@b.c"), "alt");
  assert.deepEqual(log, ["create:true", "list:1", "update:alt:true", "upsert:alt"]);
});

test("vorhandenes Konto jenseits der ersten 1000: weitere Seiten lesen", async () => {
  const seite1 = Array.from({ length: 1000 }, (_, i) => ({ id: `u${i}`, email: `u${i}@b.c` }));
  const { client, log } = konto("already registered", [], [seite1, [{ id: "spaet", email: "a@b.c" }]]);
  assert.equal(await stelleKontoSicher(client, "a@b.c"), "spaet");
  assert.deepEqual(log, ["create:true", "list:1", "list:2", "update:spaet:true", "upsert:spaet"]);
});

test("fremder Fehler oder fehlendes Konto bricht ab", async () => {
  await assert.rejects(stelleKontoSicher(konto("boom", []).client, "a@b.c"));
  await assert.rejects(stelleKontoSicher(konto("already registered", []).client, "a@b.c"));
});
