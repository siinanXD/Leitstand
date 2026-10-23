import assert from "node:assert/strict";
import { test } from "node:test";
import type { Treffer } from "../autonomy/research";
import { baueBlock, istEchteEntscheidung, leseBlock } from "./entscheidung";

const jetzt = new Date("2026-10-23T12:00:00Z");
const treffer = (n: number, o: Partial<Treffer> = {}): Treffer => ({ quelle: "github", name: `a/r${n}`, url: `https://github.com/a/r${n}`, lizenz: "MIT", sterne: 900, datum: "2026-10-23", letzterCommit: "2026-09-30", ...o });

test("Test: Routinefehler bleibt `needs-human`, neues Secret wird `entscheidung` mit Art `zugang`", () => {
  for (const grund of ["Test rot: build nach 3 Reparaturrunden noch offen", "Prüfer-Fund im Scope", "Reparaturrunden aufgebraucht"]) assert.equal(istEchteEntscheidung(grund), null);
  assert.equal(istEchteEntscheidung("Braucht ein neues Secret für Resend"), "zugang");
  assert.equal(istEchteEntscheidung("Neue Komponente nötig"), "design");
  assert.equal(istEchteEntscheidung("Umfang ändern"), "produkt");
});

test("Test: Block enthält Frage, Optionen, Empfehlung und höchstens 5 Recherche-Treffer", () => {
  const roh = baueBlock({ frage: "Welche Bibliothek?", art: "produkt", optionen: [{ titel: "A", folge: "x" }, { titel: "B", folge: "y" }], empfehlung: "A.", recherche: [1, 2, 3, 4, 5, 6, 7].map((n) => treffer(n, n === 1 ? { sterne: 10 } : {})) }, jetzt);
  const b = leseBlock(roh);
  assert.equal(b?.frage, "Welche Bibliothek?");
  assert.equal(b?.optionen.length, 2);
  assert.equal(b?.recherche.length, 5);
  assert.match(b?.empfehlung ?? "", /a\/r2 erfüllt die Regeln/);
});

test("Empfehlung nennt keinen Treffer, der die Regeln verletzt", () => {
  const b = leseBlock(baueBlock({ frage: "F", art: "kosten", optionen: [{ titel: "A", folge: "" }], empfehlung: "A.", recherche: [treffer(1, { lizenz: "GPL-3.0" }), treffer(2, { letzterCommit: "2025-01-01" })] }, jetzt));
  assert.equal(b?.empfehlung, "A.");
});
