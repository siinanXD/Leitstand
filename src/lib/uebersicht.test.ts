import assert from "node:assert/strict";
import { test } from "node:test";
import { ladeQuelle, type Lesequelle } from "./supabase";
import { aktivitaet, heuteSatz, kontingente, parseEvents, parseSnapshot, pipeline, schiene } from "./uebersicht";

const jetzt = new Date("2026-10-08T12:00:00Z");
const vor = (h: number) => new Date(jetzt.getTime() - h * 3_600_000).toISOString();

test("parseEvents verwirft kaputte Zeilen", () => {
  assert.deepEqual(parseEvents("x"), []);
  assert.equal(parseEvents([{ id: 1, created_at: vor(1) }, { created_at: "kaputt" }, null]).length, 1);
});

test("parseEvents liest step, status, issue und pr", () => {
  const [e] = parseEvents([{ created_at: vor(1), project: "leitstand", step: "dispatch", status: "ok", issue: "SIN-410", pr: 9, type: "alt" }]);
  assert.deepEqual([e.step, e.status, e.issue, e.pr], ["dispatch", "ok", "SIN-410", 9]);
});

test("parseSnapshot braucht ein Projekt", () => {
  const s = parseSnapshot([{ project: "a", stage: "build", quota_used: "x" }, { stage: "x" }]);
  assert.equal(s.length, 1);
  assert.equal(s[0].quota_used, null);
});

test("aktivitaet sammelt 24 Eimer und ignoriert Älteres", () => {
  const e = parseEvents([{ created_at: vor(0.5) }, { created_at: vor(0.2) }, { created_at: vor(5.5) }, { created_at: vor(30) }]);
  const a = aktivitaet(e, jetzt);
  assert.equal(a.length, 24);
  assert.equal(a[23], 2);
  assert.equal(a[18], 1);
  assert.equal(a.reduce((x, y) => x + y, 0), 3);
});

test("pipeline zählt je Stufe", () => {
  const s = parseSnapshot([{ project: "a", stage: "build" }, { project: "b", stage: "build" }, { project: "c", stage: "test" }]);
  assert.deepEqual(pipeline(s), [{ stage: "build", anzahl: 2 }, { stage: "test", anzahl: 1 }]);
});

test("kontingente kennzeichnet Claude als Schätzung", () => {
  const s = parseSnapshot([
    { project: "a", quota_name: "Claude", quota_used: 3, quota_limit: 10 },
    { project: "b", quota_name: "X", quota_used: 1, quota_limit: 0 },
  ]);
  assert.deepEqual(kontingente(s), [{ name: "Claude", used: 3, limit: 10, schaetzung: true }]);
});

test("heuteSatz ist ohne Daten null, sonst mit Belegen", () => {
  assert.equal(heuteSatz({ events: [], snapshot: [] }, jetzt), null);
  const r = heuteSatz({ events: parseEvents([{ created_at: vor(1) }]), snapshot: parseSnapshot([{ project: "a", status: "waiting" }]) }, jetzt);
  assert.equal(r?.satz, "1 Ereignis in 24 h, 1 Projekt im Stand, 1 warten auf dich.");
  assert.equal(r?.belege.length, 1);
});

const kette = (res: { data: unknown; error: unknown }) => {
  const k: Record<string, unknown> = { then: (f: (r: typeof res) => unknown) => Promise.resolve(res).then(f) };
  for (const m of ["gte", "order", "limit"]) k[m] = () => k;
  return k;
};
const fake = (tabellen: Record<string, { data: unknown; error: unknown }>, gesehen: string[] = []) =>
  ({
    from: (t: string) => ({
      select: () => {
        gesehen.push(t);
        return kette(tabellen[t]);
      },
    }),
  }) as unknown as Lesequelle;

test("ladeQuelle liest beide Tabellen mit der Sitzung", async () => {
  const gesehen: string[] = [];
  const r = await ladeQuelle(
    fake({ loop_events: { data: [{ created_at: vor(1) }], error: null }, loop_snapshot: { data: [{ project: "a" }], error: null } }, gesehen),
    jetzt,
  );
  assert.deepEqual(gesehen.sort(), ["loop_events", "loop_snapshot"]);
  assert.equal(r.zustand === "ok" && r.quelle.events.length, 1);
  assert.equal(r.zustand === "ok" && r.quelle.snapshot.length, 1);
});

test("ladeQuelle meldet Fehler statt zu raten", async () => {
  const bad = { data: null, error: { message: "x" } };
  assert.deepEqual(await ladeQuelle(fake({ loop_events: bad, loop_snapshot: { data: [], error: null } }), jetzt), { zustand: "fehler" });
  const wirft = {
    from: () => {
      throw new Error("x");
    },
  } as unknown as Lesequelle;
  assert.deepEqual(await ladeQuelle(wirft, jetzt), { zustand: "fehler" });
});

test("schiene zeigt die sieben Stufen und zählt nur echte Daten", () => {
  const s = parseSnapshot([{ project: "a", stage: "work" }, { project: "b", stage: "WORK" }, { project: "c", stage: "extra" }]);
  const r = schiene(s);
  assert.deepEqual(r.slice(0, 7).map((x) => x.stage), ["PLAN", "QUEUE", "WORK", "PR", "GATE", "MERGE", "DEPLOY"]);
  assert.equal(r[2].anzahl, 2);
  assert.deepEqual(r[7], { stage: "EXTRA", anzahl: 1 });
  assert.deepEqual(schiene([]), []);
});
