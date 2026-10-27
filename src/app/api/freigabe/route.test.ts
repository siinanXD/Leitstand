import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "./route";

test("SIN-1089: Agent-Testkonto bekommt 403 ohne GitHub-Aufruf", async (kontext) => {
  const umgebung = { NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture", LEITSTAND_GITHUB_TOKEN: "fixture", SUPABASE_SERVICE_ROLE_KEY: "fixture" };
  for (const [name, wert] of Object.entries(umgebung)) {
    const vorher = process.env[name];
    process.env[name] = wert;
    kontext.after(() => { if (vorher === undefined) delete process.env[name]; else process.env[name] = vorher; });
  }
  const aufrufe: string[] = [];
  kontext.mock.method(globalThis, "fetch", async (eingabe: string | URL | Request) => {
    const url = String(eingabe);
    aufrufe.push(url);
    if (url.endsWith("/auth/v1/user")) return Response.json({ id: "fixture", email: "agent@example.invalid", app_metadata: { agent_testnutzer: true } });
    if (url.includes("/rest/v1/leitstand_nutzer")) return Response.json([{ id: "fixture" }]);
    if (url.endsWith("/rest/v1/loop_events")) return new Response(null, { status: 201 });
    throw new Error(`Unerwarteter Netzaufruf: ${url}`);
  });
  const antwort = await POST(new Request("http://localhost/api/freigabe", {
    method: "POST", headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" },
    body: JSON.stringify({ repo: "siinanXD/Leitstand", pr: 474 }),
  }));
  assert.equal(antwort.status, 403);
  assert.equal(aufrufe.some(url => url.includes("api.github.com")), false);
  assert.equal(aufrufe.length, 3, "Authentifizierung, Nutzerprüfung und Ablehnungsprotokoll");
});
