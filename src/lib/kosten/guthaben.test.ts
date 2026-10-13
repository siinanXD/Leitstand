import assert from "node:assert/strict";
import { test } from "node:test";
import { leseWochenDeckel, zusammenfuehren } from "./kosten";
import { einzigartig, parseGuthaben, restAnteil, warnungen } from "./guthaben";
import { karten } from "../uebersicht-einfach";
import { parseSnapshot } from "../uebersicht";

const g = { dienst: "Anthropic", wert: 10, gesamt: 100, einheit: "€", quelle: "gerechnet" as const, aktualisiert: "2026-10-13T05:50:00Z", link: "https://console.anthropic.com/settings/billing" };

test("parseGuthaben: Liste, Objekt und JSON-Text; Unlesbares fällt weg", () => {
  assert.deepEqual(parseGuthaben([g]), [g]);
  assert.deepEqual(parseGuthaben({ Anthropic: { wert: 10, gesamt: 100, quelle: "gerechnet", aktualisiert: g.aktualisiert, link: g.link } }), [g]);
  assert.deepEqual(parseGuthaben(JSON.stringify([g])), [g]);
  assert.deepEqual(parseGuthaben([{ ...g, quelle: "geraten" }, { ...g, wert: "x" }, { ...g, gesamt: 0 }, { wert: 1 }]), []);
  assert.equal(parseGuthaben([{ ...g, link: "javascript:alert(1)" }])[0].link, null);
  assert.deepEqual(parseGuthaben("kaputt"), []);
});

test("warnungen: Guthaben unter 20 %, Kontingent über 80 %", () => {
  assert.equal(restAnteil(g), 0.1);
  const w = warnungen([g, { ...g, dienst: "OpenAI", wert: 50 }], [{ name: "Sentry", used: 90, limit: 100 }, { name: "Vercel", used: 80, limit: 100 }]);
  assert.deepEqual(w.map((x) => x.key), ["guthaben|Anthropic", "kontingent|Sentry"]);
  assert.match(w[0].warum, /10 % übrig \(gerechnet\)/);
  assert.equal(w[0].link, g.link);
  assert.deepEqual(warnungen([], []), []);
});

test("einzigartig: je Dienst die jüngste Zeile", () => {
  const neu = { ...g, wert: 40, aktualisiert: "2026-10-14T05:50:00Z" };
  assert.deepEqual(einzigartig([neu, g]), [neu]);
});

test("Startseite: Warnung steht als Karte mit Aufladen-Link vor allen anderen", () => {
  const snapshot = parseSnapshot([{ project: "leitstand", guthaben: [g], quotas: [{ name: "Sentry", used: 90, limit: 100 }] }]);
  const liste = karten({ events: [], snapshot }, []);
  assert.deepEqual(liste.map((k) => k.titel), ["Anthropic: Guthaben wird knapp", "Sentry: Kontingent fast aufgebraucht"]);
  assert.equal(liste[0].aufladen, g.link);
  assert.equal(liste[1].aufladen, null);
});

test("Wochendeckel: letzte 7 Tage, Standard 60 €", () => {
  const jetzt = new Date("2026-10-13T10:00:00Z");
  const p = (tag: string, eur: number) => ({ tag, art: "Kurs-Inhalte", eur });
  const k = zusammenfuehren({ pipeline: [p("2026-10-13", 5), p("2026-10-07", 7), p("2026-10-06", 100)], werbemittel: [], langfuse: [] }, 100, jetzt);
  assert.equal(k.woche, 12);
  assert.equal(k.wochenDeckel, 60);
  assert.equal(zusammenfuehren({ pipeline: null, werbemittel: null, langfuse: null }, 100, jetzt).woche, null);
  assert.equal(leseWochenDeckel("45,5"), 45.5);
  assert.equal(leseWochenDeckel("-1"), 60);
  assert.equal(leseWochenDeckel(undefined), 60);
});
