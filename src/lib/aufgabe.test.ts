import assert from "node:assert/strict";
import { test } from "node:test";
import { ablauf, aufgabeLinks, kopf, parseMeldungen, zustandVon } from "./aufgabe";
import type { SnapshotRow } from "./uebersicht";

const jetzt = new Date("2026-10-13T12:00:00Z");
const snap = (o: Partial<SnapshotRow>): SnapshotRow => ({ project: "leitstand", stage: null, status: null, title: null, updated_at: null, quota_name: null, quota_used: null, quota_limit: null, issue: null, blocked_by: [], quotas: [], labels: [], minutes: null, pr: null, open_prs: [], ...o });
const zeile = (rolle: string, min: number, o: Record<string, unknown> = {}) => ({
  id: rolle,
  created_at: new Date(Date.parse("2026-10-13T10:00:00Z") + min * 60_000).toISOString(),
  issue: "SIN-456",
  payload: { rolle, issue: "SIN-456", status: "ok", zusammenfassung: `${rolle} fertig`, werkzeuge: ["Read", "Edit"], kosten_eur: 0.5, ...o },
});

test("Meldungen: nur diese Aufgabe, nur mit Rolle, älteste zuerst, Text-JSON wird gelesen", () => {
  const m = parseMeldungen([zeile("bauer", 20), zeile("ceo", 0), { created_at: "2026-10-13T10:00:00Z", issue: "SIN-456", payload: null }, { ...zeile("ceo", 5), issue: "SIN-1", payload: { rolle: "ceo", issue: "SIN-1" } }, { ...zeile("anwalt", 30), payload: JSON.stringify(zeile("anwalt", 30).payload) }, { created_at: "x", payload: { rolle: "ceo", zeitpunkt: "kaputt" } }], "SIN-456");
  assert.deepEqual(m.map((x) => x.rolle), ["ceo", "bauer", "anwalt"]);
  assert.deepEqual(parseMeldungen("nix", "SIN-456"), []);
});

test("Zustand: unbekannter Status gilt nie als fertig", () => {
  assert.equal(zustandVon("ok"), "fertig");
  assert.equal(zustandVon("rolle_gestartet"), "laeuft");
  assert.equal(zustandVon("failed"), "kaputt");
  assert.equal(zustandVon("irgendwas"), "wartet");
  assert.equal(zustandVon(null), "wartet");
});

test("Ablauf: gelaufene Rollen in Ereignis-Reihenfolge, übrige grau mit „keine Meldung“", () => {
  const s = ablauf(parseMeldungen([zeile("ceo", 0), zeile("vorarbeiter", 5), zeile("forscher", 10), zeile("bauer", 20), zeile("pruefer", 30), zeile("anwalt", 40, { status: "failed" })], "SIN-456"));
  assert.deepEqual(s.map((x) => x.name), ["CEO", "Vorarbeiter", "Forscher", "Bauer", "Prüfer", "Anwalt"]);
  assert.equal(s[5].zustand, "kaputt");
  assert.deepEqual(s[3].werkzeuge, ["Read", "Edit"]);
  const teil = ablauf(parseMeldungen([zeile("ceo", 0), zeile("bauer", 20)], "SIN-456"));
  assert.deepEqual(teil.map((x) => x.rolle), ["ceo", "bauer", "vorarbeiter", "forscher", "pruefer", "anwalt"]);
  assert.equal(teil[2].satz, "keine Meldung");
  assert.equal(teil[2].meldung, null);
  assert.equal(teil[2].zustand, "wartet");
  assert.equal(ablauf([]).length, 6);
});

test("Kopf: Titel, Dauer, Kosten, Marke; ohne Meldungen nichts erfunden", () => {
  const m = parseMeldungen([zeile("ceo", 0, { spur: "klein" }), zeile("bauer", 20, { status: "running" })], "SIN-456");
  const k = kopf(m, [snap({ issue: "SIN-456", title: "Richter prüft Fakten" })], "SIN-456", jetzt);
  assert.equal(k.titel, "Richter prüft Fakten");
  assert.equal(k.marke, "laeuft");
  assert.equal(k.dauerMin, 120);
  assert.equal(k.kostenEur, 1);
  assert.equal(k.spur, "klein");
  const leer = kopf([], [], "SIN-9", jetzt);
  assert.deepEqual([leer.marke, leer.dauerMin, leer.kostenEur, leer.titel], [null, null, null, null]);
  assert.equal(kopf(parseMeldungen([zeile("ceo", 0, { status: "failed" }), zeile("bauer", 5)], "SIN-456"), [], "SIN-456", jetzt).marke, "kaputt");
});

test("Links: Linear immer, PR und Protokoll aus Snapshot/Repo, Trace nur aus dem JSON (http/https)", () => {
  const ohne = aufgabeLinks([], [], "SIN-456");
  assert.equal(ohne.find((l) => l.name === "Linear")?.href, "https://linear.app/sinan-kahraman/issue/SIN-456");
  assert.equal(ohne.find((l) => l.name === "PR")?.href, null);
  const m = parseMeldungen([zeile("ceo", 0, { langfuse_trace: "javascript:alert(1)" }), zeile("bauer", 5, { langfuse_trace: "https://langfuse.example/trace/1" })], "SIN-456");
  const l = aufgabeLinks(m, [snap({ issue: "SIN-456", pr: 12 })], "SIN-456");
  assert.equal(l.find((x) => x.name === "PR")?.href, "https://github.com/siinanXD/Leitstand/pull/12");
  assert.equal(l.find((x) => x.name === "Langfuse-Trace")?.href, "https://langfuse.example/trace/1");
  assert.equal(aufgabeLinks(parseMeldungen([zeile("ceo", 0, { langfuse_trace: "javascript:alert(1)" })], "SIN-456"), [], "SIN-456").find((x) => x.name === "Langfuse-Trace")?.href, null);
});
