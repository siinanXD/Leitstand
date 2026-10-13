import assert from "node:assert/strict";
import { test } from "node:test";
import { bewerte, fehlendeKeys, WERKZEUGE, zeilen } from "./werkzeuge";

test("acht Werkzeuge mit Aufgabe und eindeutiger Kennung", () => {
  assert.equal(WERKZEUGE.length, 8);
  assert.equal(new Set(WERKZEUGE.map((w) => w.id)).size, 8);
  assert.ok(WERKZEUGE.every((w) => w.aufgabe.length > 0 && w.keys.length > 0));
});

test("fehlende Keys werden benannt, leere Werte zählen als fehlend", () => {
  const sentry = WERKZEUGE.find((w) => w.id === "sentry")!;
  assert.deepEqual(fehlendeKeys(sentry, { SENTRY_ORG: "x", SENTRY_AUTH_TOKEN: "" }), ["SENTRY_AUTH_TOKEN"]);
  assert.deepEqual(fehlendeKeys(sentry, { SENTRY_ORG: "x", SENTRY_AUTH_TOKEN: "t" }), []);
});

test("Anfragen tragen den Key, OpenAI/Anthropic prüft beide", () => {
  const env = { OPENAI_API_KEY: "o", ANTHROPIC_API_KEY: "a", LANGFUSE_BASE_URL: "https://cloud.langfuse.com/", LANGFUSE_PUBLIC_KEY: "p", LANGFUSE_SECRET_KEY: "s" };
  const modelle = WERKZEUGE.find((w) => w.id === "modelle")!.anfragen(env);
  assert.equal(modelle.length, 2);
  assert.equal(modelle[0].header.Authorization, "Bearer o");
  assert.equal(modelle[1].header["x-api-key"], "a");
  const lf = WERKZEUGE.find((w) => w.id === "langfuse")!.anfragen(env)[0];
  assert.equal(lf.url, "https://cloud.langfuse.com/api/public/projects");
  assert.equal(lf.header.Authorization, "Basic " + Buffer.from("p:s").toString("base64"));
});

test("bewerte: nur grün, wenn alle Antworten 2xx sind", () => {
  assert.deepEqual(bewerte([{ status: 200 }, { status: 200 }]), { ok: true, hinweis: null });
  assert.deepEqual(bewerte([{ status: 200 }, { status: 401 }]), { ok: false, hinweis: "HTTP 401" });
  assert.equal(bewerte([{ status: 429 }]).hinweis, "Zu viele Abrufe (HTTP 429)");
  assert.equal(bewerte([{ status: 0 }]).hinweis, "Nicht erreichbar");
  assert.deepEqual(bewerte([{ status: 200, fehler: true }]), { ok: false, hinweis: "Antwort mit Fehler" });
});

test("zeilen: feste Reihenfolge, ohne Eintrag unbekannt statt grün", () => {
  const z = zeilen([{ id: "linear", ok: true, hinweis: null, geprueft_at: "2026-10-13T10:00:00Z", letzte_ok_at: "2026-10-13T10:00:00Z" }, { id: "fremd", ok: true }]);
  assert.equal(z.length, 8);
  assert.equal(z[0].id, "sentry");
  assert.equal(z[0].ok, null);
  assert.equal(z.find((x) => x.id === "linear")?.ok, true);
  assert.equal(zeilen(null).every((x) => x.ok === null), true);
});
