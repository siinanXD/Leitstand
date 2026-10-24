import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deployFertig, kennzahlen, linearAbfrage, MAX_HISTORY, MAX_ISSUES_JE_SEITE, prueferBestanden, stationen, type IssueEingabe } from "./strecke";

const MARKER = `<!-- pruefer-stand:${"a".repeat(40)}:${"b".repeat(16)} -->`;
const bestanden = (am: string) => ({ createdAt: am, body: `<!-- pruefer-zweites-modell -->\n### Prüfer (zweites Modell): bestanden\n${MARKER}` });
const vollstaendig = (kennung: string, todo: string, abnahme: string): IssueEingabe => ({
  kennung,
  todoAm: todo,
  doneAm: "2026-10-23T12:00:00Z",
  ereignisse: [
    { created_at: "2026-10-23T08:00:00Z", step: "worker", status: "start", issue: kennung, pr: null },
    { created_at: abnahme, step: "abnahme", status: "ok", issue: kennung, pr: null },
  ],
  pr: {
    nummer: 1,
    erstelltAm: "2026-10-23T08:30:00Z",
    mergedAm: "2026-10-23T09:00:00Z",
    kommentare: [bestanden("2026-10-23T08:45:00Z")],
    deploys: [{ context: "Vercel", description: "Deployment has completed", created_at: "2026-10-23T09:10:00Z" }],
  },
});
const JETZT = new Date("2026-10-24T00:00:00Z");

describe("stationen", () => {
  it("liest alle Stationen aus Linear, loop_events, PR-Kommentaren und Vercel-Status", () => {
    const s = stationen(vollstaendig("SIN-1", "2026-10-23T07:00:00Z", "2026-10-23T11:00:00Z"));
    assert.equal(s.haengtBei, null);
    assert.equal(s.zeiten.merge, "2026-10-23T09:00:00Z");
    assert.equal(s.zeiten.deploy, "2026-10-23T09:10:00Z");
    assert.equal(s.zeiten.pruefer, "2026-10-23T08:45:00Z");
  });
  it("erkennt die fehlende Station als Hänge-Station", () => {
    const i = vollstaendig("SIN-2", "2026-10-23T07:00:00Z", "2026-10-23T11:00:00Z");
    const baut = { context: "Vercel", description: "Deployment is building", created_at: "2026-10-23T09:10:00Z" };
    assert.equal(stationen({ ...i, pr: { ...i.pr!, deploys: [baut] } }).haengtBei, "deploy");
    assert.equal(stationen({ ...i, pr: { ...i.pr!, kommentare: [] } }).haengtBei, "pruefer");
    assert.equal(stationen({ ...i, pr: null }).haengtBei, "pr");
  });
  it("zählt eine Probe vor dem Deploy nicht", () => {
    assert.equal(stationen(vollstaendig("SIN-3", "2026-10-23T07:00:00Z", "2026-10-23T09:05:00Z")).haengtBei, "abnahme");
  });
  it("Prüfer zählt nur mit Marker und „bestanden“", () => {
    assert.equal(prueferBestanden({ createdAt: "", body: "<!-- pruefer-zweites-modell -->\n### Prüfer (zweites Modell): Funde" }), false);
    assert.equal(prueferBestanden({ createdAt: "", body: "### Prüfer (zweites Modell): bestanden" }), false);
    assert.equal(deployFertig({ context: "Vercel", description: "Deployment has completed", created_at: "" }), true);
  });
});

describe("kennzahlen", () => {
  it("rechnet Anteil, Median und häufigste Hänge-Station aus 5 Issues", () => {
    const a = vollstaendig("SIN-1", "2026-10-23T07:00:00Z", "2026-10-23T11:00:00Z"); // 240 min
    const b = vollstaendig("SIN-2", "2026-10-23T06:00:00Z", "2026-10-23T10:00:00Z"); // 240 min
    const c = vollstaendig("SIN-3", "2026-10-23T05:00:00Z", "2026-10-23T11:00:00Z"); // 360 min
    const d = { ...vollstaendig("SIN-4", "2026-10-23T05:00:00Z", "2026-10-23T11:00:00Z"), pr: null };
    const e = { ...vollstaendig("SIN-5", "2026-10-23T05:00:00Z", "2026-10-23T11:00:00Z"), pr: null };
    const alt = { ...vollstaendig("SIN-0", "2026-10-01T05:00:00Z", "2026-10-01T11:00:00Z"), pr: null };
    const k = kennzahlen([a, b, c, d, e, alt], JETZT);
    assert.equal(k.issues, 5);
    assert.equal(k.vollstaendig, 3);
    assert.equal(k.anteil, 0.6);
    assert.equal(k.median_todo_bis_live_min, 240);
    assert.equal(k.haeufigste_haenge_station, "pr");
    assert.deepEqual(k.haengt, [
      { kennung: "SIN-4", station: "pr" },
      { kennung: "SIN-5", station: "pr" },
    ]);
  });
  it("liefert ohne Issues keine Zahlen", () => {
    const k = kennzahlen([], JETZT);
    assert.equal(k.issues, 0);
    assert.equal(k.anteil, null);
    assert.equal(k.median_todo_bis_live_min, null);
    assert.equal(k.haeufigste_haenge_station, null);
  });
});

describe("linearAbfrage", () => {
  it("holt höchstens 50 Issues je Seite mit höchstens 20 History-Einträgen", () => {
    const { query, variables } = linearAbfrage("-P7D", "cursor");
    assert.ok(MAX_ISSUES_JE_SEITE <= 50);
    assert.ok(MAX_HISTORY <= 20);
    assert.ok(query.includes("issues(first: 50,"));
    assert.ok(query.includes("history(first: 20)"));
    assert.deepEqual(variables, { ab: "-P7D", nach: "cursor" });
  });
});
