import assert from "node:assert/strict";
import { test } from "node:test";
import { ANMELDEN_FEHLER, ANMELDEN_GESENDET, CODE_FEHLER, pruefeCode, sendeLink, umleitung } from "./zugang";

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

test("pruefeCode: Erfolg, falscher und abgelaufener Code, ungültige Eingabe", async () => {
  const aufrufe: unknown[] = [];
  const mit = (error: unknown) => ({
    auth: {
      verifyOtp: async (a: unknown) => {
        aufrufe.push(a);
        return { error };
      },
    },
  });
  assert.equal(await pruefeCode(mit(null), " a@b.de ", "123 456"), null);
  assert.deepEqual(aufrufe[0], { email: "a@b.de", token: "123456", type: "email" });
  assert.equal(await pruefeCode(mit(new Error("Token has expired or is invalid")), "a@b.de", "000000"), CODE_FEHLER);
  assert.equal(await pruefeCode(mit(new Error("otp_expired")), "a@b.de", "123456"), CODE_FEHLER);
  const zahl = aufrufe.length;
  assert.equal(await pruefeCode(mit(null), "a@b.de", "12345"), CODE_FEHLER);
  assert.equal(await pruefeCode(mit(null), "a@b.de", "abcdef"), CODE_FEHLER);
  assert.equal(await pruefeCode(mit(null), "", "123456"), CODE_FEHLER);
  assert.equal(aufrufe.length, zahl, "ungültige Eingaben erreichen Supabase nicht");
  const wirft = {
    auth: {
      verifyOtp: async () => {
        throw new Error("x");
      },
    },
  };
  assert.equal(await pruefeCode(wirft, "a@b.de", "123456"), CODE_FEHLER);
});
