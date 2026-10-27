import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { kriterienHash, standMarker } from "../../../scripts/loop/beleg-stand.mjs";

const workflow = readFileSync(".github/workflows/automerge.yml", "utf8").replace(/\r\n/g, "\n");
const script = workflow.match(/          script: \|\n([\s\S]+)/)![1].split("\n").map(s => s.slice(12)).join("\n");
const run = new Function("github", "context", "core", "process", "setTimeout", `return (async () => {${script}})();`);
const sha = "a".repeat(40);
const pr = { number: 310, node_id: "node", state: "open", title: "fix(loop): Gate (SIN-854)", body: "Closes #309", draft: false, labels: [], base: { ref: "main" }, head: { ref: "codex/sin-854", sha, repo: { full_name: "siinanXD/Leitstand" } } };

/** Führt das Workflow-Skript mit wechselnden API-Snapshots aus. */
async function gate(mode: "aktuell" | "kriterien" | "head" | "linear-fehler" | "build-rot" | "final-kriterien" | "review-rot" | "retarget" | "workflow-ohne-beleg", branch = "codex/sin-854", ohneIssue = false, freigegeben = true) {
  const snapshot = { ...pr, title: ohneIssue ? "Wartung" : pr.title, head: { ...pr.head, ref: branch }, labels: ohneIssue ? [{ name: "risk:high" }, ...(freigegeben ? [{ name: "freigegeben" }] : [])] : [] };
  let prReads = 0;
  let angefordert = 0;
  let enable = 0;
  let merge = 0;
  let disable = 0;
  const alt = "1. alter Spiegeltext";
  const text = mode === "kriterien" ? "1. aktueller Linear-Text" : alt;
  const hash = kriterienHash(`SIN-854\nAuftrag\n${text}`);
  const vorher = global.fetch;
  let linearReads = 0;
  global.fetch = async () => { linearReads++; return mode === "linear-fehler" ? new Response("{}", { status: 503 }) : new Response(JSON.stringify({ data: { issue: { identifier: "SIN-854", title: "Auftrag", description: mode === "final-kriterien" && linearReads > 1 ? "neu" : text } } })); };
  try {
    const listFiles = () => {};
    const listComments = async () => ({ data: [] });
    const github = {
      paginate: async (f: unknown) => f === listFiles ? (mode === "workflow-ohne-beleg" ? [{ filename: ".github/workflows/build.yml", patch: "+# Wartung" }] : []) : mode === "workflow-ohne-beleg" ? [] : [{ user: { login: "siinanXD" }, body: mode === "review-rot" ? "<!-- pruefer-zweites-modell -->\n### Prüfer (zweites Modell): nicht bestanden" : `<!-- pruefer-zweites-modell -->\n### Prüfer (zweites Modell): bestanden\n${standMarker(sha, mode === "kriterien" && !angefordert ? kriterienHash(alt) : hash)}` }],
      rest: {
        pulls: { listFiles, merge: async (args: { sha: string }) => { assert.equal(args.sha, sha); merge++; }, get: async () => { prReads++; return { data: mode === "head" && prReads > 1 ? { ...snapshot, head: { ...snapshot.head, sha: "b".repeat(40) } } : mode === "retarget" && prReads > (ohneIssue ? 1 : 2) ? { ...snapshot, base: { ref: "anderer-branch" } } : snapshot }; } },
        checks: { listForRef: async () => ({ data: { check_runs: [{ id: 1, name: "build", head_sha: sha, status: "completed", conclusion: mode === "build-rot" ? "failure" : "success" }] } }) },
        repos: { getContent: async () => ({ data: [] }) },
        issues: { listComments, createComment: async () => {}, addLabels: async () => {} },
        git: { getCommit: async () => ({ data: { committer: { date: "2020-01-01T00:00:00Z" } } }) },
        actions: { createWorkflowDispatch: async (args: { ref: string; inputs: { pruefen: string } }) => { assert.equal(args.ref, "main"); assert.equal(args.inputs.pruefen, "true"); angefordert++; } },
      },
      graphql: async (query: string) => { if (query.includes("enablePullRequest")) enable++; else disable++; },
    };
    await run(github, { repo: { owner: "siinanXD", repo: "Leitstand" }, eventName: mode === "review-rot" ? "issue_comment" : "pull_request_target", payload: { pull_request: structuredClone(snapshot), issue: { number: 310, pull_request: {} }, comment: { user: { login: "siinanXD" }, body: "<!-- pruefer-zweites-modell -->" } } }, { info: () => {}, warning: () => {} }, { env: { GITHUB_WORKSPACE: pathToFileURL(process.cwd()).href, LINEAR_API_KEY: "fixture" } }, (f: () => void) => f());
    return { enable, disable, angefordert, merge };
  } finally { global.fetch = vorher; }
}

test("echtes Gate: aktueller Head und Linear-Text erlauben, Änderungen starten neue Review-Runde", async () => {
  assert.equal((await gate("aktuell")).merge, 1);
  const neu = await gate("kriterien");
  assert.equal(neu.angefordert, 1);
  assert.equal(neu.merge, 0, "Neue Prüfung wird asynchron angefordert, kein Merge mit altem Vertrag");
  assert.equal(neu.enable, 0);
});

test("echtes Gate: geänderter Head oder fehlendes Linear blockieren", async () => {
  for (const mode of ["head", "linear-fehler", "build-rot", "final-kriterien", "review-rot", "retarget"] as const) {
    const r = await gate(mode);
    assert.equal(r.enable, 0);
    assert.equal(r.merge, 0);
    assert.ok(r.disable >= 1);
    if (mode === "review-rot") assert.equal(r.angefordert, 0, "Fehlreview darf keine neue Endlosschleife anstoßen");
  }
});


test("SIN-1089: alle Branches sperren Headwechsel und Zielwechsel während der Prüfung", async () => {
  for (const branch of ["codex/sin-854", "fix/wartung"]) {
    for (const mode of ["head", "retarget"] as const) {
      const ergebnis = await gate(mode, branch);
      assert.equal(ergebnis.merge, 0);
      assert.equal(ergebnis.enable, 0);
    }
  }
});

test("SIN-1089: Workflow ohne Kriterienbeleg sperrt auch auf anderem Branch", async () => {
  const ergebnis = await gate("workflow-ohne-beleg", "fix/wartung");
  assert.equal(ergebnis.merge, 0);
  assert.equal(ergebnis.enable, 0);
});

test("SIN-1089: ohne Linear-Issue nur risk:high mit Freigabe und aktuellen Checks", async () => {
  assert.equal((await gate("aktuell", "fix/wartung", true)).merge, 1);
  for (const mode of ["aktuell", "head", "retarget", "build-rot"] as const) {
    const ergebnis = await gate(mode, "fix/wartung", true, mode !== "aktuell");
    assert.equal(ergebnis.merge, 0);
    assert.equal(ergebnis.enable, 0);
  }
});
