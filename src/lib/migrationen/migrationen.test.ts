import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { erwartungen, fehlendes, jeDatei, offene, type Ist } from "./migrationen";

const lies = (name: string) => readFileSync(`supabase/migrations/leitstand/${name}`, "utf8");
const ist = (spalten: Record<string, string[]>, realtime: string[] = []): Ist => ({
  spalten: new Map(Object.entries(spalten).map(([t, s]) => [t, new Set(s)])),
  realtime: new Set(realtime),
});

test("erkennt Tabelle, Spalte und Realtime-Publikation in den echten Migrationen", () => {
  const kontingent = erwartungen("k.sql", lies("20261014300000_kontingent_pausen.sql"));
  assert.deepEqual(kontingent, [{ art: "tabelle", datei: "k.sql", tabelle: "kontingent_pausen" }]);

  const ceo = erwartungen("c.sql", lies("20261014200000_ceo_bezug_realtime.sql"));
  assert.deepEqual(ceo, [
    { art: "spalte", datei: "c.sql", tabelle: "ceo_entscheidungen", spalte: "bezug" },
    { art: "publikation", datei: "c.sql", tabelle: "loop_snapshot" },
    { art: "publikation", datei: "c.sql", tabelle: "ceo_entscheidungen" },
  ]);

  const events = erwartungen("e.sql", lies("20261014000000_loop_events_realtime.sql"));
  assert.deepEqual(events, [{ art: "publikation", datei: "e.sql", tabelle: "loop_events" }]);
});

test("Kommentare zählen nicht", () => {
  assert.deepEqual(erwartungen("x.sql", "-- create table public.nein (id int);\n/* alter table a add column b int; */"), []);
});

test("mehrere Spalten in einer Anweisung", () => {
  const e = erwartungen("x.sql", "alter table public.t add column if not exists a int, add column b text;");
  assert.deepEqual(e.map((x) => x.art === "spalte" && x.spalte), ["a", "b"]);
});

test("fehlt die Spalte, meldet es die Datei mit Grund", () => {
  const erwartet = erwartungen("c.sql", lies("20261014200000_ceo_bezug_realtime.sql"));
  const f = fehlendes(erwartet, ist({ ceo_entscheidungen: ["id"], loop_snapshot: ["project"] }, ["loop_snapshot", "ceo_entscheidungen"]));
  assert.deepEqual(f, [{ datei: "c.sql", grund: "Spalte ceo_entscheidungen.bezug fehlt" }]);
});

test("fehlt die Tabelle, meldet es die Datei mit create table", () => {
  const f = fehlendes(erwartungen("k.sql", lies("20261014300000_kontingent_pausen.sql")), ist({}));
  assert.deepEqual(f, [{ datei: "k.sql", grund: "Tabelle kontingent_pausen fehlt" }]);
});

test("fehlt die Publikation, meldet es die Tabelle", () => {
  const erwartet = erwartungen("e.sql", lies("20261014000000_loop_events_realtime.sql"));
  assert.deepEqual(fehlendes(erwartet, ist({ loop_events: ["id"] })), [{ datei: "e.sql", grund: "loop_events fehlt in der Realtime-Publikation" }]);
});

test("alles eingespielt: keine Meldung", () => {
  const erwartet = erwartungen("c.sql", lies("20261014200000_ceo_bezug_realtime.sql"));
  assert.deepEqual(fehlendes(erwartet, ist({ ceo_entscheidungen: ["bezug"], loop_snapshot: [] }, ["loop_snapshot", "ceo_entscheidungen"])), []);
});

test("Tabelle der Umgebung unbekannt: Spalte und Publikation werden übersprungen (Migration überspringt sie selbst)", () => {
  const erwartet = erwartungen("c.sql", lies("20261014200000_ceo_bezug_realtime.sql"));
  assert.deepEqual(fehlendes(erwartet, ist({})), []);
});

test("jeDatei fasst Gründe zusammen", () => {
  assert.deepEqual(jeDatei([{ datei: "a", grund: "x" }, { datei: "a", grund: "y" }, { datei: "b", grund: "z" }]), [{ datei: "a", grund: "x; y" }, { datei: "b", grund: "z" }]);
});

test("offene: nur wenn das jüngste Ereignis der Datei fehlt", () => {
  const z = (min: number, status: string, issue: string) => ({ created_at: new Date(Date.UTC(2026, 9, 13, 12, min)).toISOString(), step: "migration", status, issue });
  const events = [z(0, "fehlt", "a.sql: Spalte t.x fehlt"), z(5, "ok", "a.sql: ok"), z(1, "fehlt", "b.sql: Tabelle u fehlt"), z(6, "fehlt", "b.sql: Tabelle u fehlt"), { created_at: z(7, "", "").created_at, step: "merge", status: "fehlt", issue: "c.sql: x" }];
  assert.deepEqual(offene(events), [{ datei: "b.sql", grund: "Tabelle u fehlt", zeit: Date.UTC(2026, 9, 13, 12, 6) }]);
});
