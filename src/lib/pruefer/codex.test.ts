import assert from "node:assert/strict";
import { test } from "node:test";
import { leseCodexReview, planeCodexAnstoss, type NativeReview, type Pruefstand } from "./codex";

const stand: Pruefstand = { head: "a".repeat(40), basis: "b".repeat(40), auftrag: "c".repeat(16) };
const anforderung = "2026-10-26T00:00:00Z";
const zustand = (patch = {}) => `<!-- codex-review-state:v1 ${JSON.stringify({ code_review: { commit_sha: stand.head, status: "completed", has_any_findings: false, has_unresolved_findings: false, ...patch } })} -->`;
const kriterien = (patch = {}) => `<!-- codex-kriterien:v1 ${JSON.stringify({ ...stand, ergebnis: { bestanden: true, funde: [], haken: [{ text: "Test besteht", belegt: true, beleg: "src/test.ts:1" }] }, ...patch })} -->`;
const review = (patch: Partial<NativeReview> = {}): NativeReview => ({ id: 7, body: zustand() + "\n" + kriterien(), commit_id: stand.head, submitted_at: "2026-10-26T00:01:00Z", user: { login: "chatgpt-codex-connector[bot]", type: "Bot" }, ...patch });
const lese = (reviews = [review()]) => leseCodexReview(reviews, stand, anforderung);

test("Nativer Review mit aktuellem Head, Basis und Kriterien liefert unabhängiges Ergebnis", () => {
  const e = lese(); assert.equal(e.status, "fertig");
  if (e.status === "fertig") assert.equal(e.ergebnis.haken?.[0].belegt, true);
});

test("Fehlende Kriterien bleiben offen, auch wenn der native Codereview keine Funde hat", () => {
  assert.equal(lese([review({ body: zustand() })]).status, "wartend");
});

test("Fremde Autoren, Nicht-Bot, alter Commit und Review vor Anforderung sind kein Beleg", () => {
  for (const patch of [
    { user: { login: "siinanXD", type: "User" } },
    { user: { login: "chatgpt-codex-connector[bot]", type: "User" } },
    { commit_id: "d".repeat(40) }, { submitted_at: "2026-10-25T23:59:00Z" },
    { submitted_at: "kaputt" },
  ]) assert.equal(lese([review(patch)]).status, "wartend");
});

test("Unvollständige, falsche oder mehrdeutige Zustandsmarker sperren", () => {
  for (const body of ["<!-- codex-review-state:v1 { -->", zustand({ status: "pending" }), zustand({ commit_sha: "d".repeat(40) }), zustand({ has_unresolved_findings: "false" }), zustand() + zustand()]) {
    assert.equal(lese([review({ body: body + "\n" + kriterien() })]).status, "wartend");
  }
});

test("Neue Basis oder Kriterienfassung und ungültiges Ergebnis entwerten Kriterienbeleg", () => {
  for (const patch of [{ basis: "d".repeat(40) }, { auftrag: "e".repeat(16) }, { head: "d".repeat(40) }, { ergebnis: {} }]) {
    assert.equal(lese([review({ body: zustand() + "\n" + kriterien(patch) })]).status, "wartend");
  }
});

test("Aktuelle ungelöste Codefunde sperren auch ohne Kriterienantwort", () => {
  const e = lese([review({ body: zustand({ has_any_findings: true, has_unresolved_findings: true }) })]);
  assert.equal(e.status, "fertig");
  if (e.status === "fertig") assert.equal(e.ergebnis.bestanden, false);
});

test("Neuester nativer Review hat Vorrang; kein Rückgriff auf früheres bestanden", () => {
  const neu = review({ id: 8, body: zustand({ status: "pending" }), submitted_at: "2026-10-26T00:02:00Z" });
  assert.equal(lese([neu, review()]).status, "wartend");
});

test("Request ist je Head idempotent; Basis-/Kriterienwechsel braucht gezielte neue Freigabe", () => {
  const request = { ...stand, erstellt: anforderung };
  const jetzt = new Date("2026-10-26T00:02:00Z");
  assert.equal(planeCodexAnstoss(stand, [request], 1, 15, jetzt).status, "wartend");
  assert.equal(planeCodexAnstoss({ ...stand, basis: "d".repeat(40) }, [request], 1, 15, jetzt).status, "blockiert");
});

test("Tagesdeckel und Timeout erzeugen weder API-Fallback noch automatischen Neustart", () => {
  const jetzt = new Date("2026-10-26T01:00:00Z");
  assert.equal(planeCodexAnstoss(stand, [], 15, 15, jetzt).status, "blockiert");
  assert.equal(planeCodexAnstoss(stand, [], 0, 15, jetzt).status, "anfordern");
  assert.equal(planeCodexAnstoss(stand, [{ ...stand, erstellt: anforderung }], 1, 15, jetzt).status, "blockiert");
});

test("Echte GitHub-Form: Bot aktualisiert Zusammenfassung als Issue-Kommentar, Kriterien separat", () => {
  const zusammenfassung = review({ id: 10, commit_id: null, body: `<!-- codex-pull-request-review-summary -->\n${zustand()}` });
  const beleg = review({ id: 11, commit_id: null, body: kriterien(), submitted_at: "2026-10-26T00:02:00Z" });
  assert.equal(lese([zusammenfassung, beleg]).status, "fertig");
});

test("Ein später entwerteter Kriterienmarker fällt nicht auf ältere Kriterien zurück", () => {
  const beleg = review({ id: 11, commit_id: null, body: kriterien({ basis: "d".repeat(40) }), submitted_at: "2026-10-26T00:02:00Z" });
  assert.equal(lese([review(), beleg]).status, "wartend");
});

test("Ein verworfener nativer Review zählt nicht als abgeschlossene unabhängige Prüfung", () => {
  assert.equal(lese([review({ state: "DISMISSED" })]).status, "wartend");
});

test("Unvollständige Kriterienverträge werden nicht zu erfolgreichem leeren Ergebnis", () => {
  for (const ergebnis of [
    { bestanden: true, funde: [], haken: "incomplete" },
    { bestanden: true, funde: [], haken: [{ text: "Test", belegt: true }] },
    { bestanden: true, funde: [], haken: [{ text: "Test", belegt: true, beleg: "" }] },
    { bestanden: true, funde: [], haken: [{ text: "Test", belegt: "true", beleg: "x.ts:1" }] },
    { bestanden: true, funde: [] },
  ]) assert.equal(lese([review({ body: zustand() + "\n" + kriterien({ ergebnis }) })]).status, "wartend");
});
