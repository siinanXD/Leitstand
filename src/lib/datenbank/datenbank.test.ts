import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { GET } from "../../app/api/datenbank/route";
import { modell } from "./datenbank";

const ROH = {
  tabellen: [
    { name: "zeta", rls: false },
    { name: "alpha", rls: true },
  ],
  spalten: [
    { tabelle: "alpha", name: "id", typ: "uuid", null: false },
    { tabelle: "alpha", name: "zeta_id", typ: "uuid", null: true },
    { tabelle: "zeta", name: "id", typ: "uuid", null: false },
  ],
  schluessel: [
    { tabelle: "alpha", spalte: "id", art: "PRIMARY KEY", ziel_tabelle: null, ziel_spalte: null },
    { tabelle: "alpha", spalte: "zeta_id", art: "FOREIGN KEY", ziel_tabelle: "zeta", ziel_spalte: "id" },
  ],
  policies: [
    { tabelle: "alpha", name: "lesen" },
    { tabelle: "alpha", name: "ändern" },
  ],
  realtime: ["alpha"],
};

test("Abfrageergebnis → Modell: Tabellen, Spalten, Schlüssel, RLS, Realtime", () => {
  const [alpha, zeta] = modell(ROH);
  assert.deepEqual(
    [alpha.name, alpha.rls, alpha.realtime, alpha.policies, zeta.name, zeta.rls, zeta.realtime, zeta.policies],
    ["alpha", true, true, ["lesen", "ändern"].sort(), "zeta", false, false, []],
  );
  assert.deepEqual(alpha.spalten, [
    { name: "id", typ: "uuid", nullable: false, schluessel: true, verweis: null },
    { name: "zeta_id", typ: "uuid", nullable: true, schluessel: false, verweis: "zeta.id" },
  ]);
});

test("Unlesbare Abfrage ergibt keine Tabellen statt eines Fehlers", () => {
  assert.deepEqual(modell(null), []);
  assert.deepEqual(modell({ tabellen: "x" }), []);
});

test("Route ohne Sitzung: 401", async () => {
  const res = await GET(new Request("https://leitstand.example.invalid/api/datenbank"));
  assert.equal(res.status, 401);
});

test("Die Abfrage liest nur Katalog-Tabellen, nie Tabelleninhalte", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/leitstand/20261025040000_datenbank_schema.sql"), "utf8").replace(/--[^\n]*/g, "").replace(/revoke[^;]*;/g, "");
  const quellen = [...sql.matchAll(/\b(?:from|join)\s+([a-z_.]+)/g)].map((m) => m[1]);
  assert.ok(quellen.length >= 6);
  for (const q of quellen) assert.match(q, /^(information_schema|pg_catalog)\./, `keine Katalog-Tabelle: ${q}`);
});
