import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { LAUF_FRIST_MS, note, pauseZeile, pausenAlarme, rolleEingabe, rollenStand, weiterZeile, WIRKUNG_AB, zuPausieren, type RollenEreignis } from "./wirkung";

const TAG = 24 * 3_600_000;
const JETZT = WIRKUNG_AB + 20 * TAG;
const vor = (ms: number) => new Date(JETZT - ms).toISOString();
const ev = (agent: string, vorMs: number, extra: Partial<RollenEreignis> = {}): RollenEreignis => ({ agent, step: agent, status: "ok", created_at: vor(vorMs), ...extra });
const rollen = [{ id: "bauen", name: "Bauen" }, { id: "ceo", name: "CEO" }];

test("Note: Ziel erreicht = 1, keine Wirkung = 6, Werte außerhalb werden begrenzt", () => {
  assert.deepEqual([1, 0.8, 0.5, 0.2, 0, 2, -1].map(note), [1, 2, 4, 5, 6, 1, 6]);
});

test("Stand: Note aus dem Mittel der Wirkung, Kosten der Woche, letzter Lauf", () => {
  const events = [ev("bauen", TAG, { wirkung: 1, cost: 1.5 }), ev("bauen", 2 * TAG, { wirkung: 0.5, cost: 0.5 }), ev("bauen", 9 * TAG, { wirkung: 0, cost: 9 })];
  const [bauen, ceo] = rollenStand(rollen, events, JETZT);
  assert.equal(bauen.wirkung, 0.75);
  assert.equal(bauen.note, 2);
  assert.equal(bauen.kosten7d, 2);
  assert.equal(bauen.letzterLauf, vor(TAG));
  assert.equal(bauen.laeuft, true);
  assert.deepEqual([ceo.laeuft, ceo.note, ceo.letzterLauf, ceo.kosten7d], [false, null, null, null]);
});

test("„ok“ ohne Wirkung gibt keine Note; ohne Ereignis in 48 h läuft die Rolle nicht", () => {
  const events = [ev("bauen", LAUF_FRIST_MS + 1000), ev("ceo", TAG)];
  const [bauen, ceo] = rollenStand(rollen, events, JETZT);
  assert.equal(bauen.laeuft, false);
  assert.equal(ceo.laeuft, true);
  assert.equal(ceo.note, null);
});

test("Auto-Pause: 14 Tage ohne Wirkung pausiert, Wirkung 0 zählt nicht, Wirkung innerhalb der Frist rettet", () => {
  const events = [ev("bauen", 13 * TAG, { wirkung: 0.4 }), ev("ceo", 2 * TAG, { wirkung: 0 }), ev("ceo", 15 * TAG, { wirkung: 1 })];
  assert.deepEqual(zuPausieren(rollen, events, JETZT), ["ceo"]);
});

test("Auto-Pause: erst 14 Tage nach Einführung, sonst würden alle Rollen sofort pausiert", () => {
  assert.deepEqual(zuPausieren(rollen, [], WIRKUNG_AB + 13 * TAG), []);
  assert.deepEqual(zuPausieren(rollen, [], WIRKUNG_AB + 14 * TAG), ["bauen", "ceo"]);
});

test("Pause schreibt ein Ereignis, danach nicht noch einmal; Knopf hebt sie auf", () => {
  const pause = { ...pauseZeile("ceo", "CEO"), created_at: vor(1000) } as RollenEreignis;
  assert.equal(pause.status, "uebersprungen");
  assert.equal(rollenStand(rollen, [pause], JETZT)[1].pausiert, true);
  assert.deepEqual(zuPausieren(rollen, [pause], JETZT), ["bauen"]);
  const weiter = { ...weiterZeile("ceo"), created_at: vor(100) } as RollenEreignis;
  const [, ceo] = rollenStand(rollen, [pause, weiter], JETZT);
  assert.equal(ceo.pausiert, false);
  assert.equal(ceo.letzterLauf, null);
});

test("Push: ein Alarm je Pause mit Begründung, nur frische Pausen", () => {
  const pause = { ...pauseZeile("ceo", "CEO"), created_at: vor(1000) } as RollenEreignis;
  const alt = { ...pauseZeile("bauen", "Bauen"), created_at: vor(3 * TAG) } as RollenEreignis;
  const a = pausenAlarme([pause, alt, ev("ceo", 10)], JETZT);
  assert.equal(a.length, 1);
  assert.match(a[0].titel, /CEO pausiert: 14 Tage ohne Wirkung/);
  assert.equal(a[0].art, "alarm");
});

test("Knopf-Eingabe: nur bekannte Rollen", () => {
  assert.equal(rolleEingabe({ agent: "ceo" }, ["ceo"]), "ceo");
  assert.equal(rolleEingabe({ agent: "x" }, ["ceo"]), null);
  assert.equal(rolleEingabe(null, ["ceo"]), null);
});

test("Register: jede Rolle hat eine Kennzahl mit Ziel", () => {
  const r = JSON.parse(readFileSync("docs/autonomy/agents.json", "utf8")) as { rollen: { id: string; wirkung?: { kennzahl: string; ziel: string } }[] };
  for (const x of r.rollen) assert.ok(x.wirkung?.kennzahl && x.wirkung.ziel, x.id);
});
