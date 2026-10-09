import assert from "node:assert/strict";
import { test } from "node:test";
import { hex, knotenBild, knotenWerte, werteAus, type FigmaKnoten } from "./figma";

const antwort = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
});

test("hex: Farbe mit und ohne Deckkraft", () => {
  assert.equal(hex({ r: 0.0470588, g: 0.0392157, b: 0.0352941 }), "#0C0A09");
  assert.equal(hex({ r: 1, g: 1, b: 1 }, 0.5), "#FFFFFF80");
});

test("werteAus: Größe, Abstände, Farben, Text und Schrift, rekursiv", () => {
  const k: FigmaKnoten = {
    name: "Knopf",
    type: "FRAME",
    absoluteBoundingBox: { width: 350, height: 48 },
    paddingLeft: 8,
    cornerRadius: 2,
    fills: [{ type: "SOLID", color: { r: 0.76, g: 0.255, b: 0.047 } }, { type: "SOLID", visible: false, color: { r: 0, g: 0, b: 0 } }],
    children: [{ name: "Freigeben", type: "TEXT", characters: "Freigeben", style: { fontFamily: "Geist", fontWeight: 600, fontSize: 16, lineHeightPx: 20 } }],
  };
  const w = werteAus(k);
  assert.equal(w.size, "350x48");
  assert.equal(w.paddingLeft, 8);
  assert.equal(w.cornerRadius, 2);
  assert.deepEqual(w.fills, ["#C2410C"]);
  assert.equal(w.children?.[0].text, "Freigeben");
  assert.equal(w.children?.[0].font, "Geist 600 16/20");
});

test("ohne Token: null, kein Netzaufruf", async () => {
  let aufrufe = 0;
  const f = async () => {
    aufrufe++;
    return antwort({});
  };
  assert.equal(await knotenWerte("K", "1:2", {}, f), null);
  assert.equal(await knotenBild("K", "1:2", {}, f), null);
  assert.equal(aufrufe, 0);
});

test("knotenWerte: liest den Knoten, Fehler bei HTTP oder fehlendem Knoten", async () => {
  const env = { FIGMA_ACCESS_TOKEN: "t" };
  const ok = async () => antwort({ nodes: { "1:2": { document: { name: "E2", type: "FRAME" } } } });
  assert.deepEqual(await knotenWerte("K", "1:2", env, ok), { name: "E2", type: "FRAME" });
  await assert.rejects(knotenWerte("K", "9:9", env, ok), /nicht gefunden/);
  await assert.rejects(knotenWerte("K", "1:2", env, async () => antwort({}, false, 403)), /HTTP 403/);
});

test("knotenBild: holt die Bild-URL und dann die Bytes", async () => {
  const urls: string[] = [];
  const f = async (url: string) => {
    urls.push(url);
    return url.includes("/images/") ? antwort({ images: { "1:2": "https://bild" } }) : antwort(null);
  };
  const png = await knotenBild("K", "1:2", { FIGMA_ACCESS_TOKEN: "t" }, f);
  assert.deepEqual([...png!], [1, 2, 3]);
  assert.match(urls[0], /images\/K\?ids=1%3A2&format=png&scale=1/);
  assert.equal(urls[1], "https://bild");
});
