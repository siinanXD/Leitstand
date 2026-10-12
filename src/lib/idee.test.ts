import assert from "node:assert/strict";
import { test } from "node:test";
import { bestaetigung, ideeAnlegen, ideeEingabe, ideeZeile, linearNetz, type LinearNetz, type NeuesIssue } from "./idee";

function netz(angelegt: NeuesIssue[], ohne: { label?: string; meilenstein?: string; projekt?: boolean } = {}): LinearNetz {
  const meilensteine = [{ id: "m-v2", name: "v2 Ideen" }, { id: "m-v1", name: "v1" }].filter((m) => m.name !== ohne.meilenstein);
  return {
    projekt: async () => (ohne.projekt ? null : { id: "p1", teamId: "t1", meilensteine }),
    labels: async () => [{ id: "l-idee", name: "idee" }, { id: "l-dringend", name: "dringend" }].filter((l) => l.name !== ohne.label),
    status: async () => [{ id: "s-backlog", name: "Backlog" }, { id: "s-todo", name: "Todo" }],
    anlegen: async (i) => (angelegt.push(i), { identifier: "SIN-900", url: "https://linear.app/x/SIN-900" }),
  };
}

test("Eingabe: Projekt muss bekannt, Satz nicht leer und höchstens 280 Zeichen lang sein", () => {
  assert.deepEqual(ideeEingabe({ projekt: "lernapp", text: "  Dunkler   Modus ", dringend: true }), { projekt: "lernapp", text: "Dunkler Modus", dringend: true });
  assert.deepEqual(ideeEingabe({ projekt: "lernapp", text: "x" }), { projekt: "lernapp", text: "x", dringend: false });
  assert.equal(ideeEingabe({ projekt: "gibtsnicht", text: "x" }), null);
  assert.equal(ideeEingabe({ projekt: "lernapp", text: "   " }), null);
  assert.equal(ideeEingabe({ projekt: "lernapp", text: "x".repeat(281) }), null);
  assert.equal(ideeEingabe({ projekt: "lernapp", text: "x", dringend: "ja" }), null);
  assert.equal(ideeEingabe(null), null);
});

test("Idee: Label idee, Meilenstein v2 Ideen, kein Status", async () => {
  const a: NeuesIssue[] = [];
  const e = await ideeAnlegen(netz(a), { projekt: "lernapp", text: "Idee", dringend: false });
  assert.deepEqual(e, { ok: true, kennung: "SIN-900", url: "https://linear.app/x/SIN-900", dringend: false });
  assert.deepEqual(a, [{ teamId: "t1", projectId: "p1", milestoneId: "m-v2", title: "Idee", labelIds: ["l-idee"], stateId: undefined }]);
});

test("Dringend: Labels idee und dringend, Meilenstein v1, Status Todo", async () => {
  const a: NeuesIssue[] = [];
  const e = await ideeAnlegen(netz(a), { projekt: "leitstand", text: "Jetzt", dringend: true });
  assert.equal(e.ok, true);
  assert.deepEqual(a, [{ teamId: "t1", projectId: "p1", milestoneId: "m-v1", title: "Jetzt", labelIds: ["l-idee", "l-dringend"], stateId: "s-todo" }]);
});

test("Fehlendes Projekt, Meilenstein oder Label legt nichts an", async () => {
  const a: NeuesIssue[] = [];
  assert.deepEqual(await ideeAnlegen(netz(a, { projekt: true }), { projekt: "lernapp", text: "x", dringend: false }), { ok: false, grund: "projekt" });
  assert.deepEqual(await ideeAnlegen(netz(a, { meilenstein: "v2 Ideen" }), { projekt: "lernapp", text: "x", dringend: false }), { ok: false, grund: "meilenstein" });
  assert.deepEqual(await ideeAnlegen(netz(a, { label: "dringend" }), { projekt: "lernapp", text: "x", dringend: true }), { ok: false, grund: "label" });
  assert.deepEqual(a, []);
});

test("Linear-Fehler wird zu ok:false und protokolliert als fehler", async () => {
  const n: LinearNetz = { ...netz([]), anlegen: async () => Promise.reject(new Error("500")) };
  const e = await ideeAnlegen(n, { projekt: "lernapp", text: "x", dringend: false });
  assert.deepEqual(e, { ok: false, grund: "linear" });
  assert.deepEqual(ideeZeile("lernapp", e), { project: "lernapp", step: "idee", status: "fehler", issue: null, pr: null });
});

test("Protokoll und Bestätigung", async () => {
  const e = await ideeAnlegen(netz([]), { projekt: "lernapp", text: "x", dringend: true });
  assert.deepEqual(ideeZeile("lernapp", e), { project: "lernapp", step: "idee", status: "dringend", issue: "SIN-900", pr: null });
  assert.equal(bestaetigung(true), "Kommt sofort dran");
  assert.equal(bestaetigung(false), "Kommt nach und nach dran");
});

test("linearNetz: issueCreate mit Meilenstein, Labels und Status", async () => {
  const bodies: { variables: { i: Record<string, unknown> } }[] = [];
  const hole = (async (_u: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ data: { issueCreate: { success: true, issue: { identifier: "SIN-1", url: "u" } } } }));
  }) as typeof fetch;
  await linearNetz("k", hole).anlegen({ teamId: "t", projectId: "p", milestoneId: "m", title: "T", labelIds: ["a"], stateId: "s" });
  assert.deepEqual(bodies[0].variables.i, { teamId: "t", projectId: "p", projectMilestoneId: "m", title: "T", labelIds: ["a"], stateId: "s" });
});
