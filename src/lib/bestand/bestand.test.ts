import assert from "node:assert/strict";
import { test } from "node:test";
import { holeSeiten, sammle, sammleAlle, type Anfrage, type Fund, type Lader } from "./bestand";

const anfrage: Anfrage = { produkt: "leitstand", bereich: "planer", feature: "Bestandsabgleich", begriffe: ["bestand"] };
const fund = (titel: string, zustand?: string): Fund => ({ titel, url: `https://example.invalid/${encodeURIComponent(titel)}`, ...(zustand ? { zustand } : {}) });
const ok = (eintraege: Fund[], ref = "r", sha: string | null = "abc") => async () => ({ ref, sha, eintraege });
const kaputt = (text: string) => async (): Promise<never> => { throw new Error(text); };
const voll: Lader = {
  gedaechtnis: ok([fund("Bestandsabgleich Entscheidung"), fund("Anderes")], "siinanXD/gedaechtnis", "v1"),
  code: ok([fund("src/lib/bestand/bestand.ts"), fund("src/lib/bestand/bestand.test.ts"), fund("src/lib/andere.ts")], "siinanXD/Leitstand", "c1"),
  linear: ok([fund("SIN-858 Bestandsabgleich 1/3", "started"), fund("SIN-1 Erledigt: Bestandsabgleich", "completed")], "Leitstand", null),
  prs: ok([fund("feat(bestand): Bestandsabgleich (SIN-858)", "open")], "siinanXD/Leitstand", "h1"),
};

test("vollständig vorhandenes Feature: Bausteine, offene Arbeit, keine fehlenden Nachweise", async () => {
  const b = await sammle(anfrage, voll);
  assert.deepEqual(Object.keys(b), ["produkt", "bereich", "feature", "quellen", "vorhandene_bausteine", "offene_arbeit", "fehlende_nachweise", "quellfehler"]);
  assert.equal(b.quellen.length, 4);
  assert.ok(b.quellen.every((q) => q.status === "ok"));
  assert.deepEqual(b.vorhandene_bausteine.filter((x) => x.quelle === "code").map((x) => x.titel), ["src/lib/bestand/bestand.ts", "src/lib/bestand/bestand.test.ts"]);
  assert.deepEqual(b.offene_arbeit.map((x) => x.titel), ["SIN-858 Bestandsabgleich 1/3", "feat(bestand): Bestandsabgleich (SIN-858)"]);
  assert.deepEqual(b.fehlende_nachweise, []);
  assert.deepEqual(b.quellfehler, []);
});

test("teilweise vorhandenes Feature: Code ohne Test und ohne Notiz meldet fehlende Nachweise", async () => {
  const b = await sammle(anfrage, { ...voll, code: ok([fund("src/lib/bestand/bestand.ts")]), gedaechtnis: ok([]) });
  assert.deepEqual(b.fehlende_nachweise, ["Code ohne Test gefunden", "Keine Gedächtnis-Notiz gefunden"]);
});

test("unlesbare Quelle wird benannt, die übrigen bleiben auswertbar", async () => {
  const b = await sammle(anfrage, { ...voll, linear: kaputt("Linear: 400"), prs: kaputt("GitHub: 403") });
  assert.deepEqual(b.quellfehler, ["linear: Quelle nicht lesbar", "prs: Quelle nicht lesbar"]);
  assert.equal(b.quellen.find((q) => q.art === "linear")?.status, "fehler");
  assert.equal(b.vorhandene_bausteine.length, 3);
  assert.deepEqual(b.offene_arbeit, []);
  assert.match(b.fehlende_nachweise.join("\n"), /linear nicht lesbar/);
});

test("anderer Produktbereich bleibt bei einem Quellfehler auswertbar", async () => {
  const lader = (a: Anfrage): Lader => (a.bereich === "defekt" ? { ...voll, code: kaputt("Checkout fehlt") } : voll);
  const [a, b] = await sammleAlle([{ ...anfrage, bereich: "defekt" }, anfrage], lader);
  assert.equal(a.quellfehler.length, 1);
  assert.deepEqual(b.quellfehler, []);
  assert.equal(b.vorhandene_bausteine.length, 4);
});

test("Treffer mit Geheimnis wird verworfen und nicht berichtet", async () => {
  const token = `ghp_${"a".repeat(36)}`;
  const b = await sammle(anfrage, { ...voll, linear: ok([fund(`Bestandsabgleich ${token}`)]) });
  assert.ok(!JSON.stringify(b).includes(token));
  assert.match(b.quellfehler.join(), /Geheimnis/);
});

test("Pagination liest alle Seiten bis zur kurzen Seite", async () => {
  const gelesen: number[] = [];
  const alle = await holeSeiten(async (n) => { gelesen.push(n); return n < 3 ? [n, n] : [n]; }, 2);
  assert.deepEqual(gelesen, [1, 2, 3]);
  assert.deepEqual(alle, [1, 1, 2, 2, 3]);
});

test("Pagination: Fehler auf Folgeseite liefert keine Teilmenge, Endlosschleife bricht ab", async () => {
  await assert.rejects(holeSeiten(async (n) => { if (n === 2) throw new Error("GitHub: 502"); return [1, 2]; }, 2), /502/);
  await assert.rejects(holeSeiten(async () => [1, 2], 2, 5), /Seiten/);
});


test("Inhalt trifft auch bei anderem Dateinamen; Rohtext und Fehlergeheimnisse bleiben privat", async () => {
  const b = await sammle(anfrage, { ...voll, code: ok([{ titel: "src/anderer-name.ts", url: "https://example.invalid/code", inhalt: "Bestandsabgleich private details", inhalt_sha256: "hash", sha: "commit" }]), linear: kaputt("private details") });
  assert.equal(b.vorhandene_bausteine.find((x) => x.quelle === "code")?.sha, "commit");
  assert.ok(!JSON.stringify(b).includes("private details"));
  await assert.rejects(sammle({ ...anfrage, begriffe: [] }, voll), /Suchbegriffe/);
});
