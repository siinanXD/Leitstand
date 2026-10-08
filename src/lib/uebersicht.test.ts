import assert from "node:assert/strict";
import { test } from "node:test";
import { ladeQuelle } from "./supabase";
import { aktivitaet, heuteSatz, kontingente, parseEvents, parseSnapshot, pipeline } from "./uebersicht";

const jetzt = new Date("2026-10-08T12:00:00Z");
const vor = (h: number) => new Date(jetzt.getTime() - h * 3_600_000).toISOString();

test("parseEvents verwirft kaputte Zeilen", () => {
  assert.deepEqual(parseEvents("x"), []);
  assert.equal(parseEvents([{ id: 1, created_at: vor(1) }, { created_at: "kaputt" }, null]).length, 1);
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

test("ladeQuelle ohne Variablen meldet nicht-konfiguriert", async () => {
  assert.deepEqual(await ladeQuelle({}), { zustand: "nicht-konfiguriert" });
});

test("ladeQuelle liest beide Tabellen und fängt Fehler", async () => {
  const urls: string[] = [];
  const ok = (async (u: string) => {
    urls.push(u);
    return { ok: true, json: async () => [] };
  }) as unknown as typeof fetch;
  const r = await ladeQuelle({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co/", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" }, ok, jetzt);
  assert.equal(r.zustand, "ok");
  assert.ok(urls.some((u) => u.startsWith("https://x.supabase.co/rest/v1/loop_events")));
  assert.ok(urls.some((u) => u.includes("/loop_snapshot")));
  const bad = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
  assert.deepEqual(await ladeQuelle({ NEXT_PUBLIC_SUPABASE_URL: "https://x", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" }, bad, jetzt), { zustand: "fehler" });
});
