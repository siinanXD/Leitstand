import assert from "node:assert/strict";
import { test } from "node:test";
import type { SnapshotRow } from "../uebersicht";
import { entscheide, entscheidungsZeile, gedaechtnisZeile, letzteJeProdukt, ohneDaten, startbar, type ProduktLage } from "./ceo";
import { neueIssueTitel, zaehleHaken } from "./fertig";

const lage: ProduktLage = { id: "lernapp", name: "Lern-App", startbar: 1, fertig: 3, gesamt: 10, rot: null, wartetAufSinan: [], metaPrsHeute: 0, ideenDieseWoche: 0 };
const zeile = (o: Partial<SnapshotRow>): SnapshotRow => ({ project: "lernapp", stage: null, status: "Todo", title: null, updated_at: null, quota_name: null, quota_used: null, quota_limit: null, issue: "SIN-1", blocked_by: [], quotas: [], labels: ["claude"], minutes: null, pr: null, open_prs: [], ...o });

test("Fixture deckt die 4 Entscheidungsarten ab", () => {
  const bauen = entscheide(lage);
  assert.equal(bauen.art, "weiterbauen");
  assert.equal(bauen.auffuellen, 7); // auf höchstens 8 auffüllen
  assert.match(bauen.grund, /3 von 10/);

  const repariert = entscheide({ ...lage, rot: "die kaputte Live-Prüfung" });
  assert.equal(repariert.art, "reparieren");
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
  assert.equal(entscheide({ ...lage, startbar: 5, fertig: 10, gesamt: 10, rot: "Sentry" }).art, "reparieren");
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
  assert.deepEqual(entscheidungsZeile(e, "vorrat", null), { produkt: "lernapp", entscheidung: "weiterbauen", grund: e.grund, ausloeser: "vorrat", dringend: false, issue_url: null });
  assert.match(gedaechtnisZeile(e, "2026-10-13"), /^- 2026-10-13 CEO weiterbauen: Lern-App/);
  const l = letzteJeProdukt([
    { produkt: "lernapp", entscheidung: "warten", grund: "alt", created_at: "2026-10-12T06:00:00Z" },
    { produkt: "lernapp", entscheidung: "reparieren", grund: "neu", created_at: "2026-10-13T06:00:00Z" },
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
  assert.match(e.grund, /Keine Daten/);
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
