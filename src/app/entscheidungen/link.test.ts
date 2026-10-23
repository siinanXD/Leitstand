import assert from "node:assert/strict";
import { test } from "node:test";
import { rechercheLink } from "./link";

test("Test: Recherche-Link nimmt nur die https-Adresse aus dem Eintrag", () => {
  assert.equal(rechercheLink("vercel/next.js https://github.com/vercel/next.js · MIT · 130000 Sterne"), "https://github.com/vercel/next.js");
  assert.equal(rechercheLink("https://huggingface.co/x/y"), "https://huggingface.co/x/y");
});

test("Test: javascript:, http: und Text ohne Adresse werden kein Link", () => {
  assert.equal(rechercheLink("javascript:alert(1)"), null);
  assert.equal(rechercheLink("böse javascript:alert(1)//https://x"), null);
  assert.equal(rechercheLink("http://example.com"), null);
  assert.equal(rechercheLink("nur Text"), null);
});
