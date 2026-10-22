import assert from "node:assert/strict";
import { test } from "node:test";
import { stelleKontoSicher, type KontoClient } from "./sitzung";

type Nutzer = { id: string; email: string; app_metadata?: Record<string, unknown> };
const agent = (id: string, email: string): Nutzer => ({ id, email, app_metadata: { agent_testnutzer: true } });

function konto(createFehler: string | null, vorhanden: Nutzer[], seiten?: Nutzer[][]) {
  const log: string[] = [];
  const client: KontoClient = {
    auth: {
      admin: {
        createUser: async (a) => (log.push(`create:${a.app_metadata.agent_testnutzer}`), createFehler ? { data: null, error: { message: createFehler } } : { data: { user: { id: "neu" } }, error: null }),
        listUsers: async ({ page }) => (log.push(`list:${page}`), { data: { users: seiten ? (seiten[page - 1] ?? []) : vorhanden }, error: null }),
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

test("vorhandenes Agent-Konto: Id per listUsers, Upsert gesetzt", async () => {
  const { client, log } = konto("User already registered", [{ id: "x", email: "andere@b.c" }, agent("alt", "A@B.C")]);
  assert.equal(await stelleKontoSicher(client, "a@b.c"), "alt");
  assert.deepEqual(log, ["create:true", "list:1", "upsert:alt"]);
});

test("bestehendes Konto ohne Marker wird nie übernommen", async () => {
  const { client, log } = konto("User already registered", [{ id: "fremd", email: "a@b.c" }]);
  await assert.rejects(stelleKontoSicher(client, "a@b.c"), /ohne Marker/);
  assert.deepEqual(log, ["create:true", "list:1"]);
});

test("vorhandenes Konto jenseits der ersten 1000: weitere Seiten lesen", async () => {
  const seite1 = Array.from({ length: 1000 }, (_, i) => ({ id: `u${i}`, email: `u${i}@b.c` }));
  const { client, log } = konto("already registered", [], [seite1, [agent("spaet", "a@b.c")]]);
  assert.equal(await stelleKontoSicher(client, "a@b.c"), "spaet");
  assert.deepEqual(log, ["create:true", "list:1", "list:2", "upsert:spaet"]);
});

test("fremder Fehler oder fehlendes Konto bricht ab", async () => {
  await assert.rejects(stelleKontoSicher(konto("boom", []).client, "a@b.c"));
  await assert.rejects(stelleKontoSicher(konto("already registered", []).client, "a@b.c"));
});
