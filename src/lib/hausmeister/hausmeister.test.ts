import assert from "node:assert/strict";
import { test } from "node:test";
import { entscheidungenOhneIssue, lehrenZuLang, listeMarkdown, skripteOhneAufrufer, workflowsOhneLauf } from "./hausmeister";

test("Entscheidungen ohne SIN-Nummer werden gefunden", () => {
  assert.deepEqual(entscheidungenOhneIssue(["SIN-413-loop.md", "notizen.md", "bild.png"]), ["notizen.md"]);
});

test("LEHREN: ab 151 Zeilen gemeldet", () => {
  assert.equal(lehrenZuLang("a\n".repeat(149)), null);
  assert.equal(lehrenZuLang("a\n".repeat(150)), 151);
});

test("Workflows: alt, nie gelaufen und ungültig zählen, frische nicht", () => {
  const jetzt = new Date("2026-10-13T07:00:00Z");
  const r = workflowsOhneLauf(
    [
      { name: "frisch", letzterLauf: "2026-10-10T00:00:00Z" },
      { name: "alt", letzterLauf: "2026-09-01T00:00:00Z" },
      { name: "nie", letzterLauf: null },
      { name: "kaputt", letzterLauf: "gestern" },
    ],
    jetzt,
  );
  assert.deepEqual(r, ["alt", "nie", "kaputt"]);
});

test("Skripte ohne Aufrufer: eigene Datei zählt nicht", () => {
  const dateien = [
    { name: "scripts/a/ceo.ts", text: "ceo" },
    { name: "scripts/a/tot.ts", text: "tot" },
    { name: ".github/x.yml", text: "npx tsx scripts/a/ceo.ts" },
  ];
  assert.deepEqual(skripteOhneAufrufer(["scripts/a/ceo.ts", "scripts/a/tot.ts"], dateien), ["scripts/a/tot.ts"]);
});

test("Liste nennt leere Abschnitte ehrlich", () => {
  const md = listeMarkdown({ knip: ["src/x.ts"], dubletten: 0, workflows: [], skripte: [], entscheidungen: [], lehrenZeilen: null }, "2026-10-13");
  assert.match(md, /- src\/x\.ts/);
  assert.match(md, /Nichts gefunden\./);
});
