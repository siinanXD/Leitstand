import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "./route";

const FADEN = "00000000-0000-4000-8000-000000000001";
const anfrage = (body: unknown, mitSitzung: boolean) =>
  new Request("https://leitstand.example.invalid/api/chat", { method: "POST", headers: { "content-type": "application/json", ...(mitSitzung ? { authorization: "Bearer t" } : {}) }, body: JSON.stringify(body) });

function umgebung() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  delete process.env.AGENT_TESTNUTZER_EMAIL;
  const geschrieben: { tabelle: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (ziel: string | URL | Request, init?: RequestInit) => {
    const url = String(ziel instanceof Request ? ziel.url : ziel);
    if (url.includes("/auth/v1/user")) return Response.json({ id: "u", email: "sinan@example.invalid" });
    if (url.includes("/rest/v1/leitstand_nutzer")) return Response.json([{ user_id: "u" }]);
    if (init?.method === "POST") geschrieben.push({ tabelle: url.split("/rest/v1/")[1]!, body: JSON.parse(String(init.body)) });
    if (url.includes("loop_snapshot")) return Response.json([{ project: "leitstand", issue: "SIN-865", status: "running", labels: "sinan", pr: 433 }]);
    if (url.includes("leitstand_aufgaben")) return Response.json([{ issue: "SIN-865", titel: "Chatbubble", status: "laeuft", labels: ["claude"] }]);
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  return geschrieben;
}

test("Test: POST /api/chat ohne Sitzung liefert 401", async () => {
  const geschrieben = umgebung();
  const res = await POST(anfrage({ faden: FADEN, text: "SIN-865?" }, false));
  assert.equal(res.status, 401);
  assert.equal(geschrieben.length, 0);
});

test("Statusfrage wird sofort aus den Daten beantwortet; beide Nachrichten und das Protokoll werden geschrieben", async () => {
  const geschrieben = umgebung();
  const res = await POST(anfrage({ faden: FADEN, text: "Wie steht SIN-865?" }, true));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { antwort: string; sofort: boolean };
  assert.equal(body.sofort, true);
  assert.match(body.antwort, /SIN-865 „Chatbubble“: läuft gerade, Claude arbeitet daran, offener PR #433, braucht Sinan/);
  assert.deepEqual(geschrieben.map((g) => g.tabelle), ["chat_nachrichten", "chat_nachrichten", "loop_events"]);
  assert.deepEqual(geschrieben.map((g) => g.body.rolle), ["sinan", "leitstand", undefined]);
  assert.equal(geschrieben[2]!.body.step, "chat");
});

test("andere Fragen bekommen „Ich schaue nach.“; ungültige Eingabe liefert 400", async () => {
  umgebung();
  const res = await POST(anfrage({ faden: FADEN, text: "Plane die Woche" }, true));
  assert.deepEqual(await res.json().then((b: { antwort: string; sofort: boolean }) => [b.antwort, b.sofort]), ["Ich schaue nach.", false]);
  assert.equal((await POST(anfrage({ faden: "x", text: "hi" }, true))).status, 400);
  assert.equal((await POST(anfrage({ faden: FADEN, text: " " }, true))).status, 400);
});

test("Lesefehler bei loop_snapshot: „Ich schaue nach.“ statt geratener Statusantwort", async () => {
  umgebung();
  const vorher = globalThis.fetch;
  globalThis.fetch = (async (ziel: string | URL | Request, init?: RequestInit) =>
    String(ziel).includes("loop_snapshot") ? new Response(null, { status: 500 }) : vorher(ziel, init)) as typeof fetch;
  const body = (await (await POST(anfrage({ faden: FADEN, text: "Wie steht SIN-865?" }, true))).json()) as { antwort: string; sofort: boolean };
  assert.deepEqual([body.antwort, body.sofort], ["Ich schaue nach.", false]);
});
