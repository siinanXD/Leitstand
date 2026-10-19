import assert from "node:assert/strict";
import { test } from "node:test";
import { pruefeLive } from "./live";
import { fuehreAus } from "../abnahme/ausfuehren";
import type { Probe } from "../abnahme/abnahme";

const probe: Probe = { id: "p", produkt: "leitstand", titel: "Live", art: "http", issue: "SIN-830", kriterium: "Live", url: "https://example.test/health", enthaelt: "fertig" };
const belege = [{ text: "Live", art: "live" as const, belegt: true, beleg: "https://untrusted.test/erfunden" }];
const runUrl = "https://github.com/fixture/repo/actions/runs/123";

test("Modell-URL und Datei-Existenz belegen kein Live-Verhalten; tatsächlichen Antwortinhalt prüfen", async () => {
  const aufrufe: string[] = [];
  const messen = (text: string) => (p: Probe) => fuehreAus(p, {}, async (url) => { aufrufe.push(String(url)); return new Response(text, { status: 200 }); });
  const a = { belege, proben: [probe], issue: "SIN-830", runUrl };
  assert.equal((await pruefeLive(a, messen("nicht bereit")))[0].belegt, false);
  assert.equal((await pruefeLive(a, messen("fertig")))[0].belegt, true);
  assert.deepEqual(aufrufe, [probe.url, probe.url]);
  assert.equal((await pruefeLive({ ...a, proben: [{ ...probe, art: "datei" }] }, messen("fertig")))[0].belegt, false);
  assert.equal((await pruefeLive({ ...a, issue: "SIN-999" }, messen("fertig")))[0].belegt, false);
  assert.equal((await pruefeLive({ ...a, runUrl: null }, messen("fertig")))[0].belegt, false);
  assert.equal((await pruefeLive(a, async () => { throw new Error("offline"); }))[0].belegt, false);
});

test("Datenbank-Probe liest echte Zeilen und wertet Frische statt URL/HTTP 200 allein", async () => {
  const db = { ...probe, art: "db" as const, rest: "events?select=created_at", zeitfeld: "created_at", max_alter_min: "60" };
  const env = { SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "fixture" };
  const lesen = (p: Probe) => fuehreAus(p, env, async (_url, init) => { assert.equal(init?.method, undefined); return Response.json([{ created_at: "2000-01-01T00:00:00Z" }]); });
  assert.equal((await pruefeLive({ belege, proben: [db], issue: "SIN-830", runUrl }, lesen))[0].belegt, false);
});
