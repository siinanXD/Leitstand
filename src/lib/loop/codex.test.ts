import assert from "node:assert/strict";
import { test } from "node:test";
import type { LinearIssue } from "./auswahl";
import { codexGeeignet, codexUebergabe } from "./codex";
import { planeFallback, reserviere, type Auftrag, type ProviderStand, type Speicher } from "./fallback";

const jetzt = new Date("2026-10-19T18:00:00Z");
const frei: ProviderStand = { adapter: true, fehler: null, bis: null, versuche: 0 };
const auftrag = (labels: string[]): Auftrag => ({ issue: "SIN-870", pr: null, branch: null, revision: 0, worker: null, reparaturen: 0, codexGeeignet: codexGeeignet(labels), codexZuerst: true });
const plane = (a: Auftrag) => planeFallback(a, { claude: frei, codex: frei }, jetzt, []);

test("Nur `codex` mit `risk:low` ist geeignet; alles andere bleibt bei Claude", () => {
  assert.equal(codexGeeignet(["claude", "codex", "risk:low"]), true);
  assert.equal(codexGeeignet(["claude", "Codex", "Risk:Low"]), true);
  for (const l of [[], ["claude"], ["codex"], ["claude", "risk:low"], ["codex", "risk:medium"], ["codex", "risk:low", "risk:high"], ["codex", "risk:low", "no-automerge"], ["codex", "risk:low", "sinan"]]) {
    assert.equal(codexGeeignet(l), false, l.join());
  }
  assert.equal(plane(auftrag(["claude", "risk:low"])).provider, "claude");
  assert.equal(plane(auftrag(["codex", "risk:medium"])).provider, "claude");
});

test("Label `codex` mit `risk:low` geht zuerst an Codex, bei Codex-Ausfall an Claude", () => {
  const a = auftrag(["codex", "risk:low"]);
  assert.equal(plane(a).provider, "codex");
  assert.equal(planeFallback(a, { claude: frei, codex: { ...frei, fehler: "auth" } }, jetzt, []).provider, "claude");
});

test("Genau ein Implementierer: der Claim des einen Providers sperrt den anderen", async () => {
  let stand = auftrag(["codex", "risk:low"]);
  const speicher: Speicher = {
    async tausche(issue, revision, neu) {
      if (issue !== stand.issue || revision !== stand.revision) return false;
      stand = { ...neu };
      return true;
    },
  };
  const a = stand;
  const e = plane(a);
  assert.equal(e.provider, "codex");
  assert.equal(await reserviere(a, e, "lauf-codex", speicher), true);
  // Claude versucht denselben Stand: Compare-and-swap verliert, danach ist der Auftrag aktiv und nie wieder startbereit.
  assert.equal(await reserviere(a, { ...e, provider: "claude" }, "lauf-claude", speicher), false);
  assert.equal(stand.worker?.provider, "codex");
  assert.equal(plane(stand).status, "aktiv");
  assert.equal(plane(stand).provider, "codex");
});

test("Übergabe: Branch, Draft-Titel mit Marker und Linear-ID, Brief mit Beschreibung", () => {
  const i = { identifier: "SIN-870", title: "Codex-Routing", url: "https://linear.app/x", description: "Ziel" } as LinearIssue;
  const u = codexUebergabe(i);
  assert.equal(u.branch, "codex/auftrag-sin-870");
  assert.equal(u.datei, "docs/autonomy/auftraege/SIN-870.md");
  assert.match(u.titel, /^chore\(worker\): Codex-Routing \[codex-worker\] \(SIN-870\)$/);
  assert.match(u.commit, /Part of SIN-870/);
  assert.match(u.brief, /Ziel/);
  assert.throws(() => codexUebergabe({ ...i, identifier: "x" }));
});
