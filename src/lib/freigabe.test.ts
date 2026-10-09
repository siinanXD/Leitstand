import assert from "node:assert/strict";
import { test } from "node:test";
import { freigeben, githubNetz, grundFuerFreigabe, istPrNummer, istRepo, protokollZeile, type Netz, type PrKopf } from "./freigabe";

const kopf = (o: Partial<PrKopf> = {}): PrKopf => ({ number: 7, title: "t", body: null, state: "open", draft: false, merged: false, html_url: "u", user: "x", head: "h", base: "main", sha: "abc", labels: [], ...o });

function netz(pr: PrKopf, aufrufe: string[]): Netz {
  return {
    pr: async () => pr,
    dateien: async () => [],
    label: async (_r, nr, name) => void aufrufe.push(`label ${nr} ${name}`),
    squash: async (_r, nr, sha) => void aufrufe.push(`squash ${nr} ${sha}`),
  };
}

test("Lern-App: Label freigegeben, kein Merge", async () => {
  const a: string[] = [];
  assert.deepEqual(await freigeben(netz(kopf(), a), "siinanXD/Content-Agent-Lernapp", 7), { ok: true, aktion: "label" });
  assert.deepEqual(a, ["label 7 freigegeben"]);
});

test("Leitstand: Squash-Merge mit Head-SHA", async () => {
  const a: string[] = [];
  assert.deepEqual(await freigeben(netz(kopf(), a), "siinanXD/Leitstand", 7), { ok: true, aktion: "merge" });
  assert.deepEqual(a, ["squash 7 abc"]);
});

test("geschlossene, gemergte und Entwurf-PRs werden nicht freigegeben", async () => {
  const a: string[] = [];
  assert.deepEqual(await freigeben(netz(kopf({ state: "closed" }), a), "siinanXD/Leitstand", 7), { ok: false, grund: "nicht-offen" });
  assert.deepEqual(await freigeben(netz(kopf({ merged: true }), a), "siinanXD/Leitstand", 7), { ok: false, grund: "nicht-offen" });
  assert.deepEqual(await freigeben(netz(kopf({ draft: true }), a), "siinanXD/Leitstand", 7), { ok: false, grund: "entwurf" });
  assert.deepEqual(a, []);
});

test("GitHub-Fehler wird zu ok:false und protokolliert als fehler", async () => {
  const n: Netz = { ...netz(kopf(), []), squash: async () => Promise.reject(new Error("409")) };
  const e = await freigeben(n, "siinanXD/Leitstand", 7);
  assert.deepEqual(e, { ok: false, grund: "github" });
  assert.deepEqual(protokollZeile("siinanXD/Leitstand", 7, e), { project: "leitstand", step: "freigabe", status: "fehler", issue: null, pr: 7 });
  assert.equal(protokollZeile("siinanXD/Content-Agent-Lernapp", 3, { ok: true, aktion: "label" }).status, "ok");
});

test("nur bekannte Repos und positive ganze PR-Nummern", () => {
  assert.equal(istRepo("siinanXD/Leitstand"), true);
  assert.equal(istRepo("evil/repo"), false);
  assert.equal(istRepo("toString"), false);
  assert.equal(istPrNummer(1), true);
  assert.deepEqual([0, -1, 1.5, NaN, "1"].map(istPrNummer), [false, false, false, false, false]);
});

test("Grund nur aus echten Merkmalen", () => {
  assert.match(grundFuerFreigabe([], [".github/workflows/a.yml"]) ?? "", /Workflows/);
  assert.match(grundFuerFreigabe(["needs-human"], ["a.ts"]) ?? "", /needs-human/);
  assert.equal(grundFuerFreigabe([], ["a.ts"]), null);
});

test("githubNetz mergt per Squash mit sha und setzt Token als Header", async () => {
  const gesehen: { url: string; init: RequestInit }[] = [];
  const hole = (async (url: string, init: RequestInit) => {
    gesehen.push({ url, init });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  await githubNetz("tok", hole).squash("siinanXD/Leitstand", 5, "abc");
  assert.equal(gesehen[0].url, "https://api.github.com/repos/siinanXD/Leitstand/pulls/5/merge");
  assert.equal(gesehen[0].init.method, "PUT");
  assert.equal(gesehen[0].init.body, JSON.stringify({ merge_method: "squash", sha: "abc" }));
  assert.equal((gesehen[0].init.headers as Record<string, string>).Authorization, "Bearer tok");
});
