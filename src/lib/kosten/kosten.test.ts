import assert from "node:assert/strict";
import { test } from "node:test";
import { ampel, kostenAlarm, leseBudget, leseLangfuse, lesePipeline, leseWerbemittel, ohneDoppelzaehlung, zusammenfuehren, type Quellen } from "./kosten";

const jetzt = new Date("2026-10-12T10:00:00Z");
const p = (tag: string, art: string, eur: number) => ({ tag, art, eur });

test("Summen heute und Monat je Kostenart, 2 Stellen", () => {
  const q: Quellen = {
    pipeline: [p("2026-10-12", "Kurs-Inhalte", 1.115), p("2026-10-12", "Kurs-Inhalte", 2.2), p("2026-10-03", "Kurs-Inhalte", 4), p("2026-09-30", "Kurs-Inhalte", 50)],
    werbemittel: [p("2026-10-12", "Werbeclips", 3)],
    langfuse: [],
  };
  const k = zusammenfuehren(q, 100, jetzt);
  assert.equal(k.heute, 6.32);
  assert.equal(k.monat, 10.32);
  assert.equal(k.zeilen.find((z) => z.art === "Kurs-Inhalte")?.monat, 7.32);
  assert.equal(k.budget, 100);
  assert.equal(k.hinweis, "Abos nicht enthalten");
});

test("fehlende Quelle: nicht verfügbar, nicht geschätzt", () => {
  const k = zusammenfuehren({ pipeline: [p("2026-10-12", "Kurs-Inhalte", 2)], werbemittel: null, langfuse: null }, 100, jetzt);
  assert.deepEqual(k.nichtVerfuegbar, ["Werbemittel", "Agenten (Langfuse)"]);
  assert.equal(k.zeilen.find((z) => z.art === "Werbemittel")?.heute, null);
  assert.equal(k.heute, 2);
  const leer = zusammenfuehren({ pipeline: null, werbemittel: null, langfuse: null }, 100, jetzt);
  assert.equal(leer.heute, null);
  assert.equal(leer.monat, null);
  assert.equal(leer.ampel, null);
});

test("keine Doppelzählung: Langfuse zählt nur über dem Ledger", () => {
  const rest = ohneDoppelzaehlung([p("2026-10-12", "x", 5), p("2026-10-11", "x", 1)], [p("2026-10-12", "k", 3), p("2026-10-11", "k", 4)]);
  assert.deepEqual(rest, [{ tag: "2026-10-12", art: "Agenten (Langfuse)", eur: 2 }]);
  const k = zusammenfuehren({ pipeline: [p("2026-10-12", "Kurs-Inhalte", 3)], werbemittel: [], langfuse: [p("2026-10-12", "x", 3)] }, 100, jetzt);
  assert.equal(k.heute, 3);
  const ohneLedger = zusammenfuehren({ pipeline: null, werbemittel: [], langfuse: [p("2026-10-12", "x", 3)] }, 100, jetzt);
  assert.ok(ohneLedger.nichtVerfuegbar.includes("Agenten (Langfuse)"));
});

test("Budget und Ampel", () => {
  assert.equal(leseBudget(undefined), 100);
  assert.equal(leseBudget("abc"), 100);
  assert.equal(leseBudget("-5"), 100);
  assert.equal(leseBudget("250,5"), 250.5);
  assert.equal(ampel(0.69), "gruen");
  assert.equal(ampel(0.7), "gelb");
  assert.equal(ampel(0.89), "gelb");
  assert.equal(ampel(0.9), "rot");
  const k = zusammenfuehren({ pipeline: [p("2026-10-02", "Kurs-Inhalte", 75)], werbemittel: [], langfuse: [] }, 100, jetzt);
  assert.equal(k.ampel, "gelb");
});

test("Alarm bei heute > 20 % des Monatsbudgets", () => {
  assert.equal(kostenAlarm(20, 100), false);
  assert.equal(kostenAlarm(20.01, 100), true);
  assert.equal(kostenAlarm(null, 100), false);
});

test("Parser: Ledger, Werbemittel, Langfuse", () => {
  assert.deepEqual(lesePipeline([{ created_at: "2026-10-12T08:00:00Z", cost_eur: "1.5" }, { created_at: "x", cost_eur: 1 }, { created_at: "2026-10-12T08:00:00Z", cost_eur: null }]), [p("2026-10-12", "Kurs-Inhalte", 1.5)]);
  assert.deepEqual(leseWerbemittel([{ created_at: "2026-10-12T08:00:00Z", kosten_eur: 2, art: "werbeclip" }, { created_at: "2026-10-12T08:00:00Z", kosten_eur: 0.1, art: "text_email" }]).map((x) => x.art), ["Werbeclips", "Werbetexte"]);
  assert.deepEqual(leseLangfuse([{ data: [{ date: "2026-10-12", totalCost: 2 }] }], 0.9), [p("2026-10-12", "Agenten (Langfuse)", 1.8)]);
  assert.equal(leseLangfuse([{ data: [{ date: "2026-10-12", totalCost: 2 }] }], null), null);
});
