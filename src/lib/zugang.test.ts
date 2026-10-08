import assert from "node:assert/strict";
import { test } from "node:test";
import { ANMELDEN_FEHLER, ANMELDEN_GESENDET, sendeLink, umleitung } from "./zugang";

test("ohne Sitzung geht es auf /anmelden, außer auf offenen Seiten", () => {
  assert.equal(umleitung(false, "/"), "/anmelden");
  assert.equal(umleitung(false, "/projekte"), "/anmelden");
  assert.equal(umleitung(false, "/anmelden"), null);
  assert.equal(umleitung(false, "/auth/callback"), null);
});

test("mit Sitzung bleibt man, /anmelden führt zur Übersicht", () => {
  assert.equal(umleitung(true, "/"), null);
  assert.equal(umleitung(true, "/anmelden"), "/");
});

test("sendeLink legt keine Nutzer an und hält Fehler allgemein", async () => {
  const aufrufe: unknown[] = [];
  const mit = (error: unknown) => ({
    auth: {
      signInWithOtp: async (a: unknown) => {
        aufrufe.push(a);
        return { error };
      },
    },
  });
  assert.equal(await sendeLink(mit(null), " a@b.de ", "https://x"), ANMELDEN_GESENDET);
  assert.deepEqual(aufrufe[0], { email: "a@b.de", options: { shouldCreateUser: false, emailRedirectTo: "https://x/auth/callback" } });
  assert.equal(await sendeLink(mit(new Error("Signups not allowed")), "a@b.de", "https://x"), ANMELDEN_FEHLER);
  assert.equal(await sendeLink(mit(null), "  ", "https://x"), ANMELDEN_FEHLER);
  const wirft = {
    auth: {
      signInWithOtp: async () => {
        throw new Error("x");
      },
    },
  };
  assert.equal(await sendeLink(wirft, "a@b.de", "https://x"), ANMELDEN_FEHLER);
});
