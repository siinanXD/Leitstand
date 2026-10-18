import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/pruefer.yml", "utf8");
const script = workflow.match(/          script: \|\n((?:            .*\n)+)/)![1].split("\n").map((s) => s.slice(12)).join("\n");
const ausfuehren = new Function("github", "context", "core", "process", `return (async () => {${script}})();`);
const repo = { full_name: "siinanXD/Leitstand" };
const pr = (ref = "claude/sin-827") => ({ state: "open", draft: false, head: { repo, ref, sha: "a".repeat(40) }, base: { repo, ref: "main", sha: "b".repeat(40) } });
async function ziel(data: ReturnType<typeof pr>, eventName = "pull_request_target", nummer = "827", ereignis?: ReturnType<typeof pr>, geschuetzt = true, workflowSha = "b".repeat(40)) {
  const outputs: Record<string, string> = {};
  await ausfuehren({ rest: { pulls: { get: async () => ({ data }) }, repos: { getBranch: async () => ({ data: { protected: geschuetzt, commit: { sha: "b".repeat(40) } } }) } } }, { repo: { owner: "siinanXD", repo: "Leitstand" }, eventName, ref: "refs/heads/main", sha: workflowSha, payload: { repository: { default_branch: "main" }, pull_request: ereignis } }, { setOutput: (k: string, v: string) => { outputs[k] = v; } }, { env: { PR: nummer } });
  return outputs;
}

test("Workflow-Zielprüfung akzeptiert Claude und Codex und liefert nur Commit-SHAs", async () => {
  for (const ref of ["claude/sin-827", "codex/sin-827"]) {
    assert.deepEqual(await ziel(pr(ref)), { basis: "b".repeat(40), head: "a".repeat(40) });
    assert.ok(workflow.includes(`startsWith(github.head_ref, '${ref.split("/")[0]}/')`));
  }
});

test("Veraltetes PR-Ereignis darf keinen inzwischen anderen Head oder Basisstand prüfen", async () => {
  const event = pr();
  await assert.rejects(ziel({ ...pr(), head: { ...pr().head, sha: "c".repeat(40) } }, "pull_request_target", "827", event), /veraltet/);
  await assert.rejects(ziel({ ...pr(), base: { ...pr().base, sha: "c".repeat(40) } }, "pull_request_target", "827", event), /veraltet/);
  assert.deepEqual(await ziel(pr(), "pull_request_target", "827", event), { basis: "b".repeat(40), head: "a".repeat(40) });
});

test("Fork, Draft, geschlossener PR und ungültige Ziele werden abgewiesen", async () => {
  const fremd = { full_name: "fremd/Leitstand" };
  for (const data of [
    { ...pr(), head: { ...pr().head, repo: fremd } },
    { ...pr(), base: { ...pr().base, repo: fremd } },
    { ...pr(), draft: true }, { ...pr(), state: "closed" }, pr("fremd/branch"),
    { ...pr(), head: { ...pr().head, sha: "--output=datei" } },
  ]) await assert.rejects(ziel(data));
  await assert.rejects(ziel(pr(), "pull_request_target", "1; echo falsch"));
  assert.deepEqual(await ziel({ ...pr(), draft: true }, "workflow_dispatch"), { basis: "b".repeat(40), head: "a".repeat(40) });
});

test("Prüfer installiert und läuft nur aus Basis, keine persistierten Git-Credentials", () => {
  const checkout = workflow.split("- uses: actions/checkout@v4")[1].split("- uses: actions/setup-node@v4")[0];
  assert.match(checkout, /ref: \$\{\{ steps.ziel.outputs.basis \}\}/);
  assert.match(checkout, /persist-credentials: false/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.doesNotMatch(workflow, /git checkout|gh pr checkout|git reset/);
  assert.match(workflow, /node --import tsx scripts\/pruefer\/pruefer.ts "\$PR" "\$BASE_SHA" "\$HEAD_SHA"/);
});

test("Workflowdefinition und Checkout werden vor PR-Code auf geschütztes main gebunden", async () => {
  assert.match(workflow, /\n  pull_request_target:\n/);
  assert.doesNotMatch(workflow, /\n  pull_request:\n/);
  assert.ok(workflow.indexOf("- id: ziel") < workflow.indexOf("- uses: actions/checkout"));
  assert.ok(workflow.indexOf("- id: ziel") < workflow.indexOf("secrets.AGENT_WORKFLOW_TOKEN"));
  await assert.rejects(ziel({ ...pr(), base: { ...pr().base, ref: "codex/untrusted" } }), /main/);
  await assert.rejects(ziel(pr(), "pull_request_target", "827", undefined, false), /geschützt/);
  await assert.rejects(ziel(pr(), "workflow_dispatch", "827", undefined, true, "c".repeat(40)), /Workflow/);
  await assert.rejects(ziel(pr(), "pull_request"), /Workflow/);
});

test("Basiswechsel löst neue Prüfung aus und Veröffentlichung bindet Basis und Head erneut", () => {
  assert.match(workflow, /types: \[[^\]]*edited[^\]]*\]/);
  assert.match(workflow, /github.event.changes.base/);
  assert.match(workflow, /Alte Prüfung bei Basiswechsel entwerten/);
  assert.match(workflow, /HEAD_SHA/);
  assert.match(workflow, /BASE_SHA/);
  assert.match(workflow, /Prüfergebnis veraltet/);
  assert.match(workflow, /if: always\(\) && github.event_name == 'pull_request_target' && github.event.changes.base/);
});

test("Basiswechsel entwertet alte Prüferbelege auch bei ungültigem neuem Ziel, nicht fremde Kommentare", async () => {
  const scripts = [...workflow.matchAll(/          script: \|\n((?:            .*\n)+)/g)];
  const invalidate = new Function("github", "context", "process", `return (async () => {${scripts[1][1].split("\n").map(s => s.slice(12)).join("\n")}})();`);
  const changed: { comment_id: number; body: string }[] = [];
  const comments = [
    { id: 1, user: { login: "siinanXD" }, body: "<!-- pruefer-zweites-modell --> alter Erfolg" },
    { id: 2, user: { login: "fremd" }, body: "<!-- pruefer-zweites-modell --> fremd" },
    { id: 3, user: { login: "github-actions[bot]" }, body: "anderer Kommentar" },
  ];
  await invalidate({ paginate: async () => comments, rest: { issues: { listComments: () => {}, updateComment: async (c: { comment_id: number; body: string }) => changed.push(c) } } }, { repo: { owner: "siinanXD", repo: "Leitstand" } }, { env: { PR: "827" } });
  assert.deepEqual(changed.map(c => c.comment_id), [1]);
  assert.match(changed[0].body, /ungültig/);
});

test("Erstinstallation stoppt vor dem Secret-Schritt, wenn die Basis noch den alten Prüfer enthält", () => {
  const start = workflow.indexOf("run: test -f src/lib/pruefer/git.ts");
  assert.ok(start > 0);
  assert.ok(start < workflow.indexOf("- id: lauf"));
  assert.ok(start < workflow.indexOf("OPENAI_API_KEY:"));
});
