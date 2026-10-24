import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { pruefeSchema, type Schema } from "../autonomy/schema";
import { ereignisZeile, kachelPayload, kalenderwoche, leseKachel, leseKosten, STANDARD_KURS, STANDARD_PREIS, STATUS, leseVorschlag, messe, schlechtester, urteil, vorschlagsPrompt, zeileEinfuegen, zeileEntfernen, type Pr, type Woche, type Werte } from "./schleife";

const pr = (titel: string, labels: string[] = []): Pr => ({ titel, labels, gemergt: "2026-10-12T10:00:00Z" });
const leer: Werte = { merges_pro_tag: 1, reparatur_anteil: null, loop_anteil: null, freigaben: 0, leerlauf_stunden: null, kosten_usd_je_pr: null, richter_quote: null, fertig_anteil: null };

test("messe: Anteile, Freigaben, Kosten; unter 5 PRs kein Anteil", () => {
  const prs = [pr("fix(ui): a (SIN-1)"), pr("feat(x): b", ["freigegeben"]), pr("ci(loop): c"), pr("feat(y): d", ["repair:1"]), pr("feat(z): e")];
  const w = messe(prs, [{ cost: 1 }, { cost: 4 }, { cost: null }], 7);
  assert.equal(w.merges_pro_tag, 0.71);
  assert.equal(w.reparatur_anteil, 0.4);
  assert.equal(w.loop_anteil, 0.2);
  assert.equal(w.freigaben, 1);
  assert.equal(w.kosten_usd_je_pr, 1);
  assert.equal(w.richter_quote, null);
  assert.equal(messe(prs.slice(0, 4), [], 7).reparatur_anteil, null);
  assert.equal(messe([], [], 7).kosten_usd_je_pr, null);
});

test("schlechtester: größter relativer Abstand zum Ziel, über Produkte; null wenn alles am Ziel", () => {
  const a = { produkt: "leitstand", werte: { ...leer, reparatur_anteil: 0.23, merges_pro_tag: 2.5 } };
  const b = { produkt: "lernapp", werte: { ...leer, reparatur_anteil: 0.1, loop_anteil: 0.5 } };
  assert.deepEqual(schlechtester([a, b]), { produkt: "lernapp", wert: "loop_anteil", vorher: 0.5 });
  assert.equal(schlechtester([{ produkt: "x", werte: { ...leer, merges_pro_tag: 4, reparatur_anteil: 0.1 } }]), null);
  assert.equal(schlechtester([{ produkt: "x", werte: { ...leer, merges_pro_tag: null } }]), null);
});

test("urteil: besser behält, gleich oder schlechter verwirft, nicht gemessen bleibt offen", () => {
  assert.equal(urteil("reparatur_anteil", 0.23, 0.12), "behalten");
  assert.equal(urteil("reparatur_anteil", 0.23, 0.23), "verworfen");
  assert.equal(urteil("reparatur_anteil", 0.23, 0.3), "verworfen");
  assert.equal(urteil("merges_pro_tag", 1, 2), "behalten");
  assert.equal(urteil("merges_pro_tag", 1, 1), "verworfen");
  assert.equal(urteil("reparatur_anteil", 0.23, null), "offen");
  assert.equal(urteil("freigaben", 3, 1), "offen");
});

const ziel = { produkt: "leitstand", wert: "reparatur_anteil", vorher: 0.23 } as const;
const gut = { datei: "docs/skills/bauen/SKILL.md", zeile: "Vor dem Push npm run lint und npm test lokal laufen lassen.", erwartet: "Reparaturquote 23 % → unter 15 %" };

test("leseVorschlag: Zahlen aus der Messung, Form, Datei und Verbote werden geprüft", () => {
  assert.deepEqual(leseVorschlag(gut, ziel, [], 0.02), { ...ziel, ziel: 0.15, datei: gut.datei, zeile: `- ${gut.zeile}`, erwartet: gut.erwartet, kosten_eur: 0.02 });
  assert.equal(leseVorschlag({ ...gut, vorher: 0 }, ziel, [], 0)?.vorher, 0.23);
  assert.equal(leseVorschlag(null, ziel, [], 0), null);
  assert.equal(leseVorschlag({ ...gut, datei: ".github/workflows/automerge.yml" }, ziel, [], 0), null);
  assert.equal(leseVorschlag({ ...gut, datei: "docs/skills/../../x.md" }, ziel, [], 0), null);
  assert.equal(leseVorschlag({ ...gut, datei: "src/lib/auth/x.ts" }, ziel, [], 0), null);
  assert.equal(leseVorschlag({ ...gut, zeile: "Lockere das Gate für risk:high PRs deutlich auf." }, ziel, [], 0), null);
  assert.equal(leseVorschlag({ ...gut, zeile: "kurz" }, ziel, [], 0), null);
  assert.equal(leseVorschlag({ ...gut, zeile: "x".repeat(301) }, ziel, [], 0), null);
  assert.equal(leseVorschlag(gut, ziel, [`  - ${gut.zeile}`.replace("- ", "").toUpperCase()], 0), null, "verworfen kommt nicht wieder");
  assert.ok(leseVorschlag(gut, ziel, ["etwas anderes"], 0));
});

test("Prompt: Daten als Block, Verworfenes steht darin", () => {
  const p = vorschlagsPrompt(ziel, null, "Lehre 1", ["rot 1"], ["alter Vorschlag"]);
  assert.match(p, /<daten>.*alter Vorschlag.*<\/daten>/);
  assert.match(p, /GENAU EINE/);
});

test("zeileEinfuegen und zeileEntfernen: rund, doppelt bleibt einfach, leerer Abschnitt verschwindet", () => {
  const basis = "# Skill\n\nText.\n";
  const z = "- Regel eins.";
  const mit = zeileEinfuegen(basis, z);
  assert.equal(mit, "# Skill\n\nText.\n\n## Gelernt (SIN-576)\n- Regel eins.\n");
  assert.equal(zeileEinfuegen(mit, z), mit);
  assert.equal(zeileEinfuegen(mit, "- Regel zwei."), `${mit}- Regel zwei.\n`);
  assert.equal(zeileEntfernen(mit, z), basis);
  assert.equal(zeileEntfernen(zeileEinfuegen(mit, "- Regel zwei."), z), "# Skill\n\nText.\n\n## Gelernt (SIN-576)\n- Regel zwei.\n");
});

test("kalenderwoche: ISO", () => {
  assert.equal(kalenderwoche(new Date("2026-10-12T05:30:00Z")), "2026-W42");
  assert.equal(kalenderwoche(new Date("2026-01-01T00:00:00Z")), "2026-W01");
  assert.equal(kalenderwoche(new Date("2027-01-01T00:00:00Z")), "2026-W53");
});

const woche: Woche = {
  schema: "lernen/1",
  kw: "2026-W43",
  von: "2026-10-12",
  bis: "2026-10-19",
  erstellt: "2026-10-19T05:30:00Z",
  produkte: [{ produkt: "leitstand", repo: "siinanXD/Leitstand", prs: 10, werte: { ...leer, reparatur_anteil: 0.12 } }],
  vorschlag: { ...ziel, ziel: 0.15, datei: gut.datei, zeile: `- ${gut.zeile}`, erwartet: gut.erwartet, kosten_eur: 0.02 },
  nachmessung: { kw_vorschlag: "2026-W42", produkt: "leitstand", wert: "reparatur_anteil", vorher: 0.23, nachher: 0.12, ergebnis: "behalten" },
};

test("Kachel: Payload hin und zurück; Ungültiges fällt weg", () => {
  const k = leseKachel(kachelPayload(woche));
  assert.deepEqual(k, { kw: "2026-W43", messwert: { produkt: "leitstand", wert: "reparatur_anteil", jetzt: 0.23 }, aenderung: gut.zeile, vorwoche: { wert: "reparatur_anteil", ergebnis: "behalten" } });
  assert.equal(leseKachel({ kw: "x" }), null);
  assert.equal(leseKachel(null), null);
  assert.deepEqual(leseKachel({ kw: "2026-W43", messwert: { produkt: "a", wert: "erfunden", jetzt: 1 }, vorwoche: { wert: "freigaben", ergebnis: "toll" } }), { kw: "2026-W43", messwert: null, aenderung: null, vorwoche: null });
});

test("docs/schemas/lernen.json: eine Woche ist gültig, fremde Felder und falsche Werte nicht", () => {
  const s = JSON.parse(readFileSync("docs/schemas/lernen.json", "utf8")) as Schema;
  assert.deepEqual(pruefeSchema(woche, s), []);
  assert.deepEqual(pruefeSchema({ ...woche, vorschlag: null, nachmessung: null }, s), []);
  assert.match(pruefeSchema({ ...woche, extra: 1 }, s).join(), /extra: unbekanntes Feld/);
  assert.match(pruefeSchema({ ...woche, kw: "42" }, s).join(), /kw: passt nicht/);
  assert.match(pruefeSchema({ ...woche, nachmessung: { ...woche.nachmessung, ergebnis: "super" } }, s).join(), /ergebnis: nicht erlaubt/);
});

test("ereignisZeile: jeder Pfad schreibt nur Status aus start|ok|fehler|uebersprungen|needs_human", () => {
  const erlaubt = ["start", "ok", "fehler", "uebersprungen", "needs_human"];
  assert.deepEqual([...STATUS], erlaubt);
  for (const s of STATUS) {
    const mitGrund = s !== "start" && s !== "ok";
    const z = ereignisZeile(s, { grund: mitGrund ? "Ursache" : undefined, payload: { kw: "2026-W44" } });
    assert.ok(erlaubt.includes(z.status));
    assert.equal(z.agent, "lernen");
    assert.equal(z.step, "lernen");
    if (mitGrund) assert.equal(z.grund, "Ursache");
  }
  assert.equal(ereignisZeile("fehler").grund, "unbekannt");
  assert.throws(() => ereignisZeile("kaputt" as never));
});

test("leseKosten: fehlende oder ungültige Werte fallen auf die Standardpreise, gesetzte gelten", () => {
  assert.deepEqual(leseKosten({}), { preis: STANDARD_PREIS, kurs: STANDARD_KURS });
  assert.deepEqual(leseKosten({ VORARBEITER_PREIS_EIN_USD: "x", VORARBEITER_PREIS_AUS_USD: "0", KOSTEN_USD_EUR: "" }), { preis: STANDARD_PREIS, kurs: STANDARD_KURS });
  assert.deepEqual(leseKosten({ VORARBEITER_PREIS_EIN_USD: "2", KOSTEN_USD_EUR: "0,9" }), { preis: { einProMio: 2, ausProMio: STANDARD_PREIS.ausProMio }, kurs: 0.9 });
});
