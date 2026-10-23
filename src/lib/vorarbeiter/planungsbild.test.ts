import assert from "node:assert/strict";
import { test } from "node:test";
import { FIGMA_FEHLT, frameFuer, legeMitPlanungsbild } from "./planungsbild";

const png = new Uint8Array([137, 80, 78, 71]);
const figma = async (url: string) =>
  url.includes("/images/")
    ? { ok: true, status: 200, json: async () => ({ images: { "52:190": "https://bild/x.png" } }), arrayBuffer: async () => png.buffer as ArrayBuffer }
    : { ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => png.buffer as ArrayBuffer };

function deps(env: Record<string, string | undefined>) {
  const angehaengt: { id: string; name: string; bytes: number }[] = [];
  const beschreibungen: string[] = [];
  const d = {
    env,
    fetch: figma as Parameters<typeof legeMitPlanungsbild>[1]["fetch"],
    legeAn: async (b: string) => (beschreibungen.push(b), "lin-1"),
    haengeAn: async (id: string, bild: Uint8Array, name: string) => void angehaengt.push({ id, name, bytes: bild.length }),
  };
  return { angehaengt, beschreibungen, d };
}

test("frameFuer: Marker in der Beschreibung gewinnt, sonst die Seite aus dem Titel", () => {
  assert.equal(frameFuer("Übersicht bauen", "figma-frame: 99:1"), "99:1");
  assert.equal(frameFuer("Seite Übersicht: Karten", ""), "52:190");
  assert.equal(frameFuer("Ablauf nach Agent", ""), "47:28");
  assert.equal(frameFuer("Etwas Unbekanntes", ""), null);
});

test("Test: Frontend-Issue bekommt ein Figma-Bild als Anhang", async () => {
  const t = deps({ FIGMA_ACCESS_TOKEN: "t" });
  await legeMitPlanungsbild({ titel: "Seite Übersicht: Karten", beschreibung: "Text", labels: ["frontend"] }, t.d);
  assert.deepEqual(t.angehaengt, [{ id: "lin-1", name: "figma-52-190.png", bytes: 4 }]);
  assert.match(t.beschreibungen[0], /Figma-Frame: `52:190`/);
});

test("Test: ohne Token entsteht der Hinweis statt eines Fehlers", async () => {
  const t = deps({});
  await legeMitPlanungsbild({ titel: "Seite Übersicht: Karten", beschreibung: "Text", labels: ["design"] }, t.d);
  assert.equal(t.angehaengt.length, 0);
  assert.ok(t.beschreibungen[0].includes(FIGMA_FEHLT));
});

test("Figma-Fehler, unbekannter Frame und Anhang-Fehler brechen den Planer nicht ab", async () => {
  const kaputt = deps({ FIGMA_ACCESS_TOKEN: "t" });
  kaputt.d.fetch = async () => {
    throw new Error("Netz");
  };
  await legeMitPlanungsbild({ titel: "Seite Übersicht", beschreibung: "", labels: ["frontend"] }, kaputt.d);
  assert.ok(kaputt.beschreibungen[0].includes(FIGMA_FEHLT));
  const ohneFrame = deps({ FIGMA_ACCESS_TOKEN: "t" });
  await legeMitPlanungsbild({ titel: "Etwas Unbekanntes", beschreibung: "", labels: ["frontend"] }, ohneFrame.d);
  assert.ok(ohneFrame.beschreibungen[0].includes(FIGMA_FEHLT));
  const anhangFehler = deps({ FIGMA_ACCESS_TOKEN: "t" });
  anhangFehler.d.haengeAn = async () => {
    throw new Error("Upload");
  };
  assert.equal(await legeMitPlanungsbild({ titel: "Seite Übersicht", beschreibung: "", labels: ["frontend"] }, anhangFehler.d), "lin-1");
});

test("Backend-Issues bleiben unberührt", async () => {
  const t = deps({ FIGMA_ACCESS_TOKEN: "t" });
  await legeMitPlanungsbild({ titel: "Seite Übersicht", beschreibung: "Text", labels: ["claude"] }, t.d);
  assert.equal(t.beschreibungen[0], "Text");
  assert.equal(t.angehaengt.length, 0);
});
