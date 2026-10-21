import assert from "node:assert/strict";
import { test } from "node:test";
import { abgelaufen, kontingentEreignis, aktivePause, istLimitMeldung, pauseSatz, resetAusHeadern, resetAusLog, resetZeit, type Pause } from "./kontingent";

const jetzt = new Date("2026-10-13T12:00:00Z");
const header = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null });
const pause = (o: Partial<Pause>): Pause => ({ dienst: "claude", bis: "2026-10-13T17:00:00Z", grund: "g", repo: null, erstellt_at: "2026-10-13T12:00:00Z", geweckt_at: null, ...o });

test("Reset aus Log ohne Zeitzone: UTC, heute", () => {
  assert.equal(resetAusLog("Claude AI usage limit reached ∙ resets 7pm", jetzt)?.toISOString(), "2026-10-13T19:00:00.000Z");
});

test("Reset aus Log ohne Zeitzone, schon vorbei: morgen", () => {
  assert.equal(resetAusLog("5-hour limit reached ∙ resets 9am", jetzt)?.toISOString(), "2026-10-14T09:00:00.000Z");
});

test("Reset aus Log mit Zeitzone und Minuten (Sommerzeit Berlin = UTC+2)", () => {
  assert.equal(resetAusLog("limit reached, resets 7:30pm (Europe/Berlin)", jetzt)?.toISOString(), "2026-10-13T17:30:00.000Z");
});

test("12am/12pm und unbekannte Zone", () => {
  assert.equal(resetAusLog("resets 12am", jetzt)?.toISOString(), "2026-10-14T00:00:00.000Z");
  assert.equal(resetAusLog("resets 12pm", new Date("2026-10-13T10:00:00Z"))?.toISOString(), "2026-10-13T12:00:00.000Z");
  assert.equal(resetAusLog("resets 7pm (Mars/Olympus)", jetzt), null);
  assert.equal(resetAusLog("kein Limit", jetzt), null);
});

test("Reset aus Headern", () => {
  assert.equal(resetAusHeadern(header({ "retry-after": "120" }), jetzt)?.toISOString(), "2026-10-13T12:02:00.000Z");
  assert.equal(resetAusHeadern(header({ "x-ratelimit-reset": "1791900000" }), jetzt)?.getTime(), 1791900000_000);
  assert.equal(resetAusHeadern(header({}), jetzt), null);
});

test("Standardwerte je Dienst", () => {
  const h = (d: Parameters<typeof resetZeit>[0]) => (resetZeit(d, {}, jetzt).getTime() - jetzt.getTime()) / 3_600_000;
  assert.equal(h("claude"), 5);
  assert.equal(h("vercel_deploys"), 24);
  assert.equal(h("github_api"), 1);
  assert.equal(h("linear_api"), 1);
  assert.equal(h("langfuse"), 1);
});

test("Log vor Header vor Standard; Zeit in der Vergangenheit zählt nicht", () => {
  assert.equal(resetZeit("claude", { log: "resets 7pm", header: header({ "retry-after": "60" }) }, jetzt).toISOString(), "2026-10-13T19:00:00.000Z");
  assert.equal(resetZeit("github_api", { header: header({ "retry-after": "60" }) }, jetzt).toISOString(), "2026-10-13T12:01:00.000Z");
  assert.equal(resetZeit("github_api", { header: header({ "x-ratelimit-reset": "1000" }) }, jetzt).toISOString(), "2026-10-13T13:00:00.000Z");
});

test("Limit-Meldung erkennen", () => {
  assert.ok(istLimitMeldung("Claude AI usage limit reached|1760000000"));
  assert.ok(istLimitMeldung("5-hour limit reached ∙ resets 7pm"));
  assert.ok(!istLimitMeldung("Tests passed"));
});

test("aktive Pause und Wecker-Auswahl", () => {
  const ps = [pause({ bis: "2026-10-13T17:00:00Z" }), pause({ bis: "2026-10-13T11:00:00Z" }), pause({ bis: "2026-10-13T10:00:00Z", geweckt_at: "2026-10-13T10:15:00Z" }), pause({ dienst: "openai", bis: "2026-10-13T11:30:00Z" })];
  assert.equal(aktivePause(ps, "claude", jetzt)?.bis, "2026-10-13T17:00:00Z");
  assert.equal(aktivePause(ps, "higgsfield", jetzt), null);
  assert.equal(aktivePause(ps, "openai", jetzt), null);
  assert.deepEqual(abgelaufen(ps, jetzt).map((p) => p.dienst), ["claude", "openai"]);
});

test("Satz in Worten, Berliner Zeit", () => {
  assert.equal(pauseSatz({ dienst: "claude", bis: "2026-10-13T17:00:00Z" }, jetzt), "Pause: Claude-Kontingent leer, geht heute um 19 Uhr weiter.");
  assert.equal(pauseSatz({ dienst: "vercel_deploys", bis: "2026-10-14T07:30:00Z" }, jetzt), "Pause: Deploy-Kontingent bei Vercel leer, geht morgen um 9:30 Uhr weiter.");
});

// Abschrift von loop_events_status_check (Supabase, inkl. needs_human aus Migration 20261021100000), bewusst unabhängig vom Code.
const ERLAUBT_IN_DB = ["start", "ok", "fehler", "uebersprungen", "needs_human"];

test("SIN-917: Kontingent-Ereignisse schreiben nur erlaubte Status", () => {
  for (const art of ["pause", "wieder-da", "uebersprungen"] as const) assert.ok(ERLAUBT_IN_DB.includes(kontingentEreignis(art, art === "uebersprungen" ? "g" : undefined).status));
  assert.deepEqual(kontingentEreignis("pause"), { status: "ok", grund: "pause" });
  assert.deepEqual(kontingentEreignis("wieder-da"), { status: "ok", grund: "wieder-da" });
  assert.deepEqual(kontingentEreignis("uebersprungen", "Rest knapp"), { status: "uebersprungen", grund: "Rest knapp" });
});
