import assert from "node:assert/strict";
import { test } from "node:test";
import { KOPPLUNG_FEHLER, KOPPLUNG_GESPERRT, holeKopplungsCode, pruefeKopplung, zeigeKopplungsCode } from "../zugang";

const als = (f: unknown) => f as typeof fetch;

test("pruefeKopplung: Erfolg tauscht Code gegen token_hash und legt die Sitzung an", async () => {
  const aufrufe: unknown[] = [];
  const client = {
    auth: {
      verifyOtp: async (a: unknown) => {
        aufrufe.push(a);
        return { error: null };
      },
    },
  };
  const hole = als(async (_url: string, init: { body: string }) => {
    assert.deepEqual(JSON.parse(init.body), { code: "123 456" });
    return Response.json({ token_hash: "th" });
  });
  assert.equal(await pruefeKopplung(client, "123 456", hole), null);
  assert.deepEqual(aufrufe, [{ token_hash: "th", type: "magiclink" }]);
});

test("pruefeKopplung: Format, Server-Fehler, Sperre und verifyOtp-Fehler", async () => {
  const client = (error: unknown) => ({ auth: { verifyOtp: async () => ({ error }) } });
  const antwort = (status: number, body: unknown = {}) => als(async () => Response.json(body, { status }));
  const nie = als(async () => assert.fail("kein Aufruf"));
  assert.equal(await pruefeKopplung(client(null), "12", nie), KOPPLUNG_FEHLER);
  assert.equal(await pruefeKopplung(client(null), "123456", antwort(400)), KOPPLUNG_FEHLER);
  assert.equal(await pruefeKopplung(client(null), "123456", antwort(429)), KOPPLUNG_GESPERRT);
  assert.equal(await pruefeKopplung(client(null), "123456", antwort(200, {})), KOPPLUNG_FEHLER);
  assert.equal(await pruefeKopplung(client(new Error("expired")), "123456", antwort(200, { token_hash: "th" })), KOPPLUNG_FEHLER);
  assert.equal(await pruefeKopplung(client(null), "123456", als(async () => Promise.reject(new Error("offline")))), KOPPLUNG_FEHLER);
});

test("holeKopplungsCode: Code mit Sitzungstoken holen, Fehler geben null", async () => {
  const hole = als(async (_url: string, init: { headers: Record<string, string> }) => {
    assert.equal(init.headers.Authorization, "Bearer tok");
    return Response.json({ code: "123456", gueltigBis: "2026-10-12T10:10:00Z" });
  });
  assert.deepEqual(await holeKopplungsCode("tok", hole), { code: "123456", gueltigBis: "2026-10-12T10:10:00Z" });
  assert.equal(await holeKopplungsCode("tok", als(async () => new Response("{}", { status: 401 }))), null);
  assert.equal(zeigeKopplungsCode("123456"), "123 456");
});
