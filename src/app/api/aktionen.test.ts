import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const AGENT = "agent@example.invalid";
const MUTIEREND = ["POST", "PUT", "PATCH", "DELETE"];
// Ohne Sitzung (kein Konto), daher bewusst ohne Prüfung: Kopplungscode einlösen.
const OHNE_SITZUNG = new Set(["kopplung/einloesen"]);

function routen(dir: string, rel = ""): string[] {
  return readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? routen(join(dir, n), join(rel, n)) : n === "route.ts" ? [rel] : []));
}

test("jede Aktions-Route (auch Pause/Notbremse) lehnt das Agent-Testkonto mit 403 ab und protokolliert", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.AGENT_TESTNUTZER_EMAIL = AGENT;
  const protokoll: string[] = [];
  globalThis.fetch = (async (ziel: string | URL | Request, init?: RequestInit) => {
    const url = String(ziel instanceof Request ? ziel.url : ziel);
    if (url.includes("/auth/v1/user")) return Response.json({ id: "u", email: AGENT });
    if (url.includes("/rest/v1/leitstand_nutzer")) return Response.json([{ user_id: "u" }]);
    if (url.includes("/rest/v1/loop_events") && init?.method === "POST") protokoll.push(String(init.body));
    return Response.json([]);
  }) as typeof fetch;

  let geprueft = 0;
  for (const rel of routen(join(process.cwd(), "src/app/api"))) {
    if (OHNE_SITZUNG.has(rel)) continue;
    const modul = (await import(`./${rel}/route`)) as Record<string, unknown>;
    for (const methode of MUTIEREND) {
      const handler = modul[methode];
      if (typeof handler !== "function") continue;
      const antwort = (await handler(new Request(`https://leitstand.example.invalid/api/${rel}`, { method: methode, headers: { authorization: "Bearer t", "content-type": "application/json" }, body: "{}" }))) as Response;
      assert.equal(antwort.status, 403, `${methode} /api/${rel}`);
      geprueft++;
    }
  }
  assert.ok(geprueft >= 10, `nur ${geprueft} Aktionen geprüft`);
  assert.equal(protokoll.length, geprueft);
});
