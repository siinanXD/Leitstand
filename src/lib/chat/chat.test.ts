import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { pruefeSchema, type Schema } from "../autonomy/schema";

const lies = <T>(pfad: string) => JSON.parse(readFileSync(pfad, "utf8")) as T;
const migration = readFileSync("supabase/migrations/leitstand/20261023160000_chat.sql", "utf8");
const schema = lies<Schema>("docs/schemas/chat.json");
const fixture = lies<Record<string, unknown>>("docs/schemas/fixtures/chat.json");

test("Migration legt chat_nachrichten und chat_aktionen mit RLS an; ohne leitstand_nutzer-Zeile wird Lesen und Schreiben abgelehnt", () => {
  for (const t of ["chat_nachrichten", "chat_aktionen"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${t} `));
    assert.match(migration, new RegExp(`alter table public\\.${t} enable row level security`));
  }
  assert.match(migration, /revoke all on public\.chat_nachrichten, public\.chat_aktionen from anon/);
  const policies = [...migration.matchAll(/create policy (\w+) on public\.(\w+) for (\w+) to (\w+)([\s\S]*?);/g)];
  assert.equal(policies.length, 5);
  for (const p of policies) {
    assert.equal(p[4], "authenticated");
    assert.match(p[5]!, /exists \(select 1 from public\.leitstand_nutzer n where n\.user_id = auth\.uid\(\)\)/);
  }
  const arten = (t: string) => policies.filter((p) => p[2] === t).map((p) => p[3]).sort();
  assert.deepEqual(arten("chat_nachrichten"), ["insert", "select"]);
  assert.deepEqual(arten("chat_aktionen"), ["insert", "select", "update"]);
  assert.doesNotMatch(migration, /drop |truncate|delete from/i);
});

test("Migration schaltet beide Tabellen für Realtime frei", () => {
  assert.match(migration, /array\['chat_nachrichten', 'chat_aktionen'\]/);
  assert.match(migration, /alter publication supabase_realtime add table/);
});

test("chat.json: Fixture gültig, Aufzählungen wie im Auftrag", () => {
  assert.deepEqual(pruefeSchema(fixture, schema), []);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties?.absicht?.enum, ["frage", "status", "update", "planung", "bauauftrag", "unklar"]);
  assert.deepEqual(schema.properties?.aktion?.enum, ["antworten", "kommentar", "issue_anlegen", "plan_vorschlagen", "rueckfrage", "bau_vorschlagen"]);
});

test("chat.json: Prüfer meldet falsche Werte", () => {
  assert.match(pruefeSchema({ ...fixture, sicherheit: 1.5 }, schema).join(), /sicherheit: über 1/);
  assert.match(pruefeSchema({ ...fixture, absicht: "plaudern" }, schema).join(), /absicht: nicht erlaubt/);
  assert.match(pruefeSchema({ ...fixture, kosten: { ...(fixture.kosten as object), quelle: "bar" } }, schema).join(), /kosten\.quelle: nicht erlaubt/);
  assert.match(pruefeSchema({ ...fixture, bezug: { issue: "864" } }, schema).join(), /bezug\.issue: passt nicht/);
  assert.match(pruefeSchema({ ...fixture, extra: 1 }, schema).join(), /extra: unbekanntes Feld/);
});
