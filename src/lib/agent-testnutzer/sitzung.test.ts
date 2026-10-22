import assert from "node:assert/strict";
import { test } from "node:test";
import { baueStorageState, speicherSchluessel } from "./sitzung";

const SESSION = { access_token: "a", refresh_token: "r", token_type: "bearer", expires_in: 3600, user: { id: "1" } };
const admin = (hash: string | undefined, error: unknown = null) => ({ auth: { admin: { generateLink: async () => ({ data: { properties: hash ? { hashed_token: hash } : null }, error }) } } });

test("storageState aus generateLink und verifyOtp", async () => {
  const aufrufe: unknown[] = [];
  const anon = { auth: { verifyOtp: async (a: unknown) => (aufrufe.push(a), { data: { session: SESSION }, error: null }) } };
  const state = await baueStorageState(admin("h1"), anon, "agent@example.invalid", "https://abc.supabase.co", "https://leitstand.example/pfad");
  assert.deepEqual(aufrufe, [{ token_hash: "h1", type: "magiclink" }]);
  assert.deepEqual(state, { cookies: [], origins: [{ origin: "https://leitstand.example", localStorage: [{ name: "sb-abc-auth-token", value: JSON.stringify(SESSION) }] }] });
});

test("Fehler bei generateLink oder verifyOtp bricht ab", async () => {
  const gut = { auth: { verifyOtp: async () => ({ data: { session: SESSION }, error: null }) } };
  await assert.rejects(baueStorageState(admin(undefined), gut, "a@b.c", "https://abc.supabase.co", "https://x.example"));
  await assert.rejects(baueStorageState(admin("h", new Error("x")), gut, "a@b.c", "https://abc.supabase.co", "https://x.example"));
  const schlecht = { auth: { verifyOtp: async () => ({ data: { session: null }, error: new Error("x") }) } };
  await assert.rejects(baueStorageState(admin("h"), schlecht, "a@b.c", "https://abc.supabase.co", "https://x.example"));
});

test("Speicherschlüssel wie in den Playwright-Tests", () => {
  assert.equal(speicherSchluessel("http://127.0.0.1:54321"), "sb-127-auth-token");
});
