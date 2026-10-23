import assert from "node:assert/strict";
import { test } from "node:test";
import { brauchtNachweis, clipSinnvoll, parseNachweis, routeVonDatei } from "./nachweis";

test("Nachweis nur für Frontend-Dateien", () => {
  assert.equal(brauchtNachweis(["docs/x.md", "scripts/a.ts"]), false);
  assert.equal(brauchtNachweis(["docs/x.md", "src/app/start/page.tsx"]), true);
  assert.equal(brauchtNachweis(["src/components/knopf.tsx"]), true);
  assert.equal(brauchtNachweis(["src/app/globals.css"]), true);
});

test("Route aus Datei", () => {
  assert.equal(routeVonDatei("src/app/page.tsx"), "/");
  assert.equal(routeVonDatei("src/app/aufgabe/[id]/page.tsx"), "/aufgabe/[id]");
  assert.equal(routeVonDatei("src/app/(x)/start/page.tsx"), "/start");
  assert.equal(routeVonDatei("src/app/kopf.tsx"), null);
});

test("Clip nur bei Interaktion oder mehreren Routen", () => {
  assert.equal(clipSinnvoll({ interaktion: false, routenImAblauf: 1 }), false);
  assert.equal(clipSinnvoll({ interaktion: true, routenImAblauf: 1 }), true);
  assert.equal(clipSinnvoll({ interaktion: false, routenImAblauf: 2 }), true);
});

const ansicht = { handy: "https://x.supabase.co/a.png", desktop: "https://x.supabase.co/b.png" };
const zeile = (min: number, o: Record<string, unknown> = {}) => ({
  created_at: `2026-10-13T10:0${min}:00Z`,
  issue: "SIN-561",
  payload: { art: "nachweis", routen: [{ route: "/start", vorher: ansicht, nachher: ansicht }], dateien: [{ datei: "src/app/page.tsx", was: "Karte" }, { was: "ohne Datei" }], ...o },
});

test("Nachweis lesen: jüngster, nur https, nur diese Aufgabe, nur Art nachweis", () => {
  const n = parseNachweis(
    [
      zeile(1, { clip: "http://unsicher/c.webm" }),
      zeile(2, { clip: "https://x.supabase.co/c.webm", routen: [{ route: "/leer", vorher: {}, nachher: { handy: "javascript:1" } }, { route: "/start", vorher: ansicht, nachher: ansicht }] }),
      { ...zeile(3), issue: "SIN-1", payload: { art: "nachweis" } },
      { created_at: "2026-10-13T10:09:00Z", issue: "SIN-561", payload: { rolle: "bauer" } },
    ],
    "SIN-561",
  );
  assert.equal(n?.clip, "https://x.supabase.co/c.webm");
  assert.deepEqual(n?.routen.map((r) => r.route), ["/start"]);
  assert.deepEqual(n?.dateien, [{ datei: "src/app/page.tsx", was: "Karte" }]);
  assert.equal(parseNachweis([zeile(1, { clip: "http://unsicher/c.webm" })], "SIN-561")?.clip, null);
  assert.equal(parseNachweis("nix", "SIN-561"), null);
  assert.equal(parseNachweis([], "SIN-561"), null);
});
