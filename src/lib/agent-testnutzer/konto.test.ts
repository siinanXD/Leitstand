import assert from "node:assert/strict";
import { test } from "node:test";
import { stelleKontoSicher, type KontoClient } from "./sitzung";

function konto(createFehler: string | null, vorhanden: { id: string; email: string }[]) {
  const log: string[] = [];
  const client: KontoClient = {
    auth: {
      admin: {
        createUser: async (a) => (log.push(`create:${a.app_metadata.agent_testnutzer}`), createFehler ? { data: null, error: { message: createFehler } } : { data: { user: { id: "neu" } }, error: null }),
        listUsers: async () => ({ data: { users: vorhanden }, error: null }),
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
  assert.deepEqual(log, ["create:true", "update:alt:true", "upsert:alt"]);
});

test("fremder Fehler oder fehlendes Konto bricht ab", async () => {
  await assert.rejects(stelleKontoSicher(konto("boom", []).client, "a@b.c"));
  await assert.rejects(stelleKontoSicher(konto("already registered", []).client, "a@b.c"));
});
