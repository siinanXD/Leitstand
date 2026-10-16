import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { SnapshotRow } from "../uebersicht";
import { bezugVon, chefSatz, entscheide, fertigMeldung, entscheidungsZeile, gedaechtnisZeile, letzteJeProdukt, luecke, ohneDaten, startbar, type ProduktLage } from "./ceo";
import { gleicheAbsicht, ideenGesperrt, neueIssueTitel, pruefeDubletten, zaehleHaken } from "./fertig";

const lage: ProduktLage = { id: "lernapp", name: "Lern-App", startbar: 1, fertig: 3, gesamt: 10, rot: null, wartetAufSinan: [], metaPrsHeute: 0, ideenDieseWoche: 0 };
const zeile = (o: Partial<SnapshotRow>): SnapshotRow => ({ project: "lernapp", stage: null, status: "Todo", title: null, updated_at: null, quota_name: null, quota_used: null, quota_limit: null, issue: "SIN-1", blocked_by: [], quotas: [], labels: ["claude"], minutes: null, pr: null, open_prs: [], ...o });

test("Fixture deckt die 3 Entscheidungsarten ab", () => {
  const bauen = entscheide(lage);
  assert.equal(bauen.art, "weiterbauen");
  assert.equal(bauen.auffuellen, 7); // auf höchstens 8 auffüllen
  assert.match(bauen.grund, /3 von 10/);

  // SIN-636: Reparaturen sind weiterbauen mit „dringend“, der Planer legt das Issue an.
  const repariert = entscheide({ ...lage, rot: "die kaputte Live-Prüfung" });
  assert.equal(repariert.art, "weiterbauen");
  assert.equal(repariert.dringend, true);
  assert.equal(repariert.grund, "Lern-App: Ich repariere zuerst die kaputte Live-Prüfung, weil echte Nutzer sonst Fehler sehen.");

  const wartet = entscheide({ ...lage, startbar: 0, wartetAufSinan: ["Freigabe PR 5", "Vercel-Variablen", "Domain"] });
  assert.equal(wartet.art, "warten");
  assert.match(wartet.grund, /Freigabe PR 5 und Vercel-Variablen und 1 weiteres/);
  assert.equal(wartet.auffuellen, 0);

  assert.equal(entscheide({ ...lage, fertig: 10, gesamt: 10 }).art, "fertig");
});

test("Vorrat reicht ab 3: nichts Neues; Rot geht vor Fertig und Vorrat", () => {
  assert.equal(entscheide({ ...lage, startbar: 3 }).auffuellen, 0);
  const rot = entscheide({ ...lage, startbar: 5, fertig: 10, gesamt: 10, rot: "Sentry" });
  assert.equal(rot.art, "weiterbauen");
  assert.equal(rot.dringend, true);
});

test("Lücke im Vorrat (Planer): unter 3 auf 8 auffüllen, sonst nichts", () => {
  assert.deepEqual([0, 2, 3, 8].map(luecke), [8, 6, 0, 0]);
});

test("Warten nur ohne startbare Issues; sonst weiterbauen", () => {
  assert.equal(entscheide({ ...lage, startbar: 2, wartetAufSinan: ["x"] }).art, "weiterbauen");
});

test("Regeln: 1 Meta-PR pro Tag, Ideen 1 pro Woche und erst nach v1", () => {
  assert.equal(entscheide({ ...lage, metaPrsHeute: 1 }).metaErlaubt, false);
  assert.equal(entscheide(lage).metaErlaubt, true);
  assert.equal(entscheide(lage).ideenErlaubt, false);
  assert.equal(entscheide({ ...lage, fertig: 10, gesamt: 10 }).ideenErlaubt, true);
  assert.equal(entscheide({ ...lage, fertig: 10, gesamt: 10, ideenDieseWoche: 1 }).ideenErlaubt, false);
});

test("Startbar: Todo mit Label claude, nicht blockiert, nicht zurückgehalten", () => {
  const s = [zeile({}), zeile({ issue: "SIN-2", blocked_by: ["SIN-1"] }), zeile({ issue: "SIN-3", labels: ["claude", "sinan"] }), zeile({ issue: "SIN-4", status: "Done" }), zeile({ issue: "SIN-5", project: "leitstand" }), zeile({ issue: "SIN-6", labels: [] })];
  assert.equal(startbar(s, "lernapp"), 1);
});

test("Zeilen für Tabelle und Gedächtnis; letzte Entscheidung je Produkt", () => {
  const e = entscheide(lage);
  assert.deepEqual(entscheidungsZeile(e, "vorrat", null), { produkt: "lernapp", entscheidung: "weiterbauen", grund: e.grund, ausloeser: "vorrat", dringend: false, issue_url: null, bezug: null });
  assert.match(gedaechtnisZeile(e, "2026-10-13"), /^- 2026-10-13 CEO weiterbauen: Lern-App/);
  const l = letzteJeProdukt([
    { produkt: "lernapp", entscheidung: "warten", grund: "alt", created_at: "2026-10-12T06:00:00Z" },
    { produkt: "lernapp", entscheidung: "reparieren", grund: "neu", created_at: "2026-10-13T06:00:00Z" }, // alte Zeile: wird als weiterbauen gelesen
    { produkt: "leitstand", entscheidung: "unsinn", grund: "x", created_at: "2026-10-13T06:00:00Z" },
    { produkt: "beleg", entscheidung: "fertig", grund: "x", created_at: "kaputt" },
  ]);
  assert.deepEqual(l.map((x) => [x.produkt, x.grund]), [["lernapp", "neu"]]);
  assert.deepEqual(letzteJeProdukt(null), []);
});

test("Ohne Snapshot-Zeile: warten, keine Daten (SIN-572)", () => {
  const e = ohneDaten("leitstand", "Leitstand");
  assert.equal(e.art, "warten");
  assert.equal(e.auffuellen, 0);
  assert.match(e.grund, /weiß noch zu wenig/);
});

test("Startbar der Leitstand-Zusammenfassung zählt queue.startable", () => {
  assert.equal(startbar([zeile({ project: "leitstand", issue: null, queue: { todo: 4, startable: 2, in_progress: 1 } })], "leitstand"), 2);
});

test("FERTIG.md: leeres Backlog + 3 offene Punkte → 3 Issues, zweiter Lauf keins", () => {
  const md = "# Fertig\n\n- [x] Anmeldung\n- [ ] Projekt-Karten\n- [ ] Ablauf-Ansicht\n* [ ] Freigabe-Seite\n";
  assert.deepEqual(zaehleHaken(md), { fertig: 1, gesamt: 4 });
  assert.equal(zaehleHaken("nichts"), null);
  const erster = neueIssueTitel(md, [], 8);
  assert.deepEqual(erster, ["Projekt-Karten", "Ablauf-Ansicht", "Freigabe-Seite"]);
  assert.deepEqual(neueIssueTitel(md, erster.map((t) => t.toUpperCase()), 8), []);
  assert.deepEqual(neueIssueTitel(md, [], 2), ["Projekt-Karten", "Ablauf-Ansicht"]);
});

test("Dubletten-Prüfung (SIN-613): gleiche Absicht, anderer Titel → kein neues Issue, höchstens 3 je Lauf", () => {
  const md = "- [ ] Screenreader-Test der Kernrouten dokumentieren\n- [ ] Ablauf-Ansicht\n- [ ] A1x\n- [ ] B2x\n- [ ] C3x\n- [ ] D4x\n";
  const r = pruefeDubletten(md, ["Manueller Screenreader-Test der Kernrouten dokumentieren"], 8);
  assert.deepEqual(r.uebersprungen, [{ titel: "Screenreader-Test der Kernrouten dokumentieren", vorhanden: "Manueller Screenreader-Test der Kernrouten dokumentieren" }]);
  assert.equal(r.neu.length, 3);
  assert.equal(gleicheAbsicht("Ablauf-Ansicht", "Projekt-Karten"), false);
});

test("Chef-Satz verfällt mit der Aufgabe (SIN-579)", () => {
  const z = { produkt: "lernapp", entscheidung: "weiterbauen" as const, grund: "Lern-App: Ich plane die nächste Lücke.", created_at: "2026-10-13T10:00:00Z", bezug: "SIN-264" };
  const titel = "Richter v2 (SIN-264)";
  assert.equal(chefSatz(z, "Lern-App", [zeile({ issue: "SIN-264", status: "Done", title: titel })]), "Lern-App: Richter v2 ist fertig. Nächstes kommt gleich.");
  assert.equal(chefSatz(z, "Lern-App", [zeile({ issue: "SIN-264", status: "In Progress", title: titel })]), z.grund);
  // Aufgabe nicht mehr in der Liste, andere Zeilen da: fertig. Keine Zeilen je Aufgabe: unverändert.
  assert.match(chefSatz(z, "Lern-App", [zeile({ issue: "SIN-300" })]), /Die Aufgabe ist fertig/);
  assert.equal(chefSatz(z, "Lern-App", []), z.grund);
  // Ohne Bezug bleibt der Satz.
  assert.equal(chefSatz({ ...z, bezug: null }, "Lern-App", [zeile({ issue: "SIN-264", status: "Done" })]), z.grund);
});

test("Bezug: was läuft, sonst die erste offene Aufgabe; wird mitgeschrieben und gelesen", () => {
  const s = [zeile({ issue: "SIN-1", status: "Todo" }), zeile({ issue: "SIN-2", status: "In Progress" }), zeile({ issue: "SIN-3", status: "Done" })];
  assert.equal(bezugVon(s, "lernapp"), "SIN-2");
  assert.equal(bezugVon([s[0], s[2]], "lernapp"), "SIN-1");
  assert.equal(bezugVon(s, "leitstand"), null);
  const e = entscheide({ ...lage, bezug: "SIN-2" });
  assert.equal(entscheidungsZeile(e, "vorrat", null).bezug, "SIN-2");
  assert.equal(letzteJeProdukt([{ produkt: "lernapp", entscheidung: "warten", grund: "x", created_at: "2026-10-13T10:00:00Z", bezug: "SIN-2" }])[0].bezug, "SIN-2");
  assert.equal(letzteJeProdukt([{ produkt: "lernapp", entscheidung: "warten", grund: "x", created_at: "2026-10-13T10:00:00Z" }])[0].bezug, null);
});

test("SIN-761: offene FERTIG.md sperrt Ideen, volle Liste nicht; Leitstand-Liste steht auf 1/5", async () => {
  assert.equal(ideenGesperrt("- [x] a\n- [ ] b\n"), true);
  assert.equal(ideenGesperrt("- [x] a\n- [x] b\n"), false);
  assert.equal(ideenGesperrt("nichts"), false);
  const md = await readFile("docs/FERTIG.md", "utf8");
  assert.deepEqual(zaehleHaken(md), { fertig: 1, gesamt: 5 });
  assert.equal(ideenGesperrt(md), true);
  // Auch mit freier Wochenquote keine Idee, solange Punkte offen sind.
  assert.equal(entscheide({ ...lage, fertig: 1, gesamt: 5, ideenDieseWoche: 0 }).ideenErlaubt, false);
});

test("SIN-761: alle Haken gesetzt → fertig + nächstes Produkt freischalten (SIN-705)", () => {
  const e = entscheide({ ...lage, id: "leitstand", name: "Leitstand", fertig: 5, gesamt: 5 });
  assert.equal(e.art, "fertig");
  assert.equal(e.freischalten, "SIN-705");
  assert.equal(entscheide({ ...lage, fertig: 10, gesamt: 10 }).freischalten, null);
  assert.equal(fertigMeldung("Leitstand"), "Produkt Leitstand ist fertig");
});
