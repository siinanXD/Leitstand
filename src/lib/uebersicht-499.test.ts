import assert from "node:assert/strict";
import { test } from "node:test";
import { ladeQuelle, type Lesequelle } from "./supabase";
import { heuteSatz, kontingente, laufend, parseEvents, parseSnapshot } from "./uebersicht";

const jetzt = new Date("2026-10-12T12:00:00Z");
const vor = (h: number) => new Date(jetzt.getTime() - h * 3_600_000).toISOString();

test("ladeQuelle lädt mehr als 1000 Ereignisse seitenweise (SIN-499)", async () => {
  const alle = Array.from({ length: 2153 }, (_, i) => ({ id: String(i), created_at: vor(1), project: i < 2136 ? "Content-Agent-Lernapp" : "leitstand" }));
  const client = {
    from: (t: string) => ({
      select: () => {
        const k: Record<string, unknown> = {};
        for (const m of ["gte", "order", "limit"]) k[m] = () => k;
        k.range = (von: number, bis: number) => Promise.resolve({ data: t === "loop_events" ? alle.slice(von, bis + 1) : [], error: null });
        k.then = (f: (r: unknown) => unknown) =>
          Promise.resolve({ data: [{ project: "Content-Agent-Lernapp", quotas: [{ name: "GitHub Actions", used: 5, limit: 10 }] }], error: null }).then(f);
        return k;
      },
    }),
  } as unknown as Lesequelle;
  const r = await ladeQuelle(client, jetzt);
  assert.equal(r.zustand, "ok");
  if (r.zustand !== "ok") return;
  assert.equal(r.quelle.events.length, 2153);
  assert.match(heuteSatz(r.quelle, jetzt)?.satz ?? "", /^2153 Ereignisse in 24 h, 2 Projekte im Stand/);
  assert.deepEqual(kontingente(r.quelle.snapshot), [{ name: "GitHub Actions", used: 5, limit: 10, schaetzung: false }]);
  assert.equal(r.quelle.snapshot[0].project, "lernapp");
});

test("parseSnapshot liest quotas als Liste, Objekt oder Text", () => {
  const s = parseSnapshot([
    { project: "a", quotas: { Claude: { used: 1, limit: 4 }, Vercel: [2, 8] } },
    { project: "b", quotas: JSON.stringify([{ name: "X", used: 0, limit: 3 }]) },
    { project: "c", quotas: "kaputt" },
  ]);
  assert.deepEqual(
    kontingente(s).map((q) => [q.name, q.used, q.limit, q.schaetzung]),
    [["Claude", 1, 4, true], ["Vercel", 2, 8, false], ["X", 0, 3, false]],
  );
});

test("laufend nimmt WORK ohne Abschluss aus den Ereignissen", () => {
  const events = parseEvents([
    { id: "1", created_at: vor(3), project: "Content-Agent-Lernapp", step: "worker", status: "start", issue: "SIN-497" },
    { id: "2", created_at: vor(2), project: "Content-Agent-Lernapp", step: "worker", status: "start", issue: "SIN-483" },
    { id: "3", created_at: vor(1), project: "Content-Agent-Lernapp", step: "pr-gate", status: "ok", issue: "SIN-483" },
  ]);
  assert.deepEqual(laufend({ events, snapshot: [] }, jetzt).map((r) => r.issue), ["SIN-497"]);
});
