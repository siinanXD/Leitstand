import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/pruefer.yml", "utf8");
const script = workflow.match(/          script: \|\n((?:            .*\n)+)/)![1].split("\n").map((s) => s.slice(12)).join("\n");
const ausfuehren = new Function("github", "context", "core", "process", `return (async () => {${script}})();`);
const repo = { full_name: "siinanXD/Leitstand" };
const pr = (ref = "claude/sin-827") => ({ state: "open", draft: false, head: { repo, ref, sha: "a".repeat(40) }, base: { repo, sha: "b".repeat(40) } });
async function ziel(data: ReturnType<typeof pr>, eventName = "pull_request", nummer = "827", ereignis?: ReturnType<typeof pr>) {
  const outputs: Record<string, string> = {};
  await ausfuehren({ rest: { pulls: { get: async () => ({ data }) } } }, { repo: { owner: "siinanXD", repo: "Leitstand" }, eventName, payload: { pull_request: ereignis } }, { setOutput: (k: string, v: string) => { outputs[k] = v; } }, { env: { PR: nummer } });
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
  await assert.rejects(ziel({ ...pr(), head: { ...pr().head, sha: "c".repeat(40) } }, "pull_request", "827", event), /veraltet/);
  await assert.rejects(ziel({ ...pr(), base: { ...pr().base, sha: "c".repeat(40) } }, "pull_request", "827", event), /veraltet/);
  assert.deepEqual(await ziel(pr(), "pull_request", "827", event), { basis: "b".repeat(40), head: "a".repeat(40) });
});

test("Fork, Draft, geschlossener PR und ungültige Ziele werden abgewiesen", async () => {
  const fremd = { full_name: "fremd/Leitstand" };
  for (const data of [
    { ...pr(), head: { ...pr().head, repo: fremd } },
    { ...pr(), base: { ...pr().base, repo: fremd } },
    { ...pr(), draft: true }, { ...pr(), state: "closed" }, pr("fremd/branch"),
    { ...pr(), head: { ...pr().head, sha: "--output=datei" } },
  ]) await assert.rejects(ziel(data));
  await assert.rejects(ziel(pr(), "pull_request", "1; echo falsch"));
  assert.deepEqual(await ziel({ ...pr(), draft: true }, "workflow_dispatch"), { basis: "b".repeat(40), head: "a".repeat(40) });
});

test("Prüfer installiert und läuft nur aus Basis, keine persistierten Git-Credentials", () => {
  const checkout = workflow.split("- uses: actions/checkout@v4")[1].split("- id: ziel")[0];
  assert.match(checkout, /ref: \$\{\{ github.event.pull_request.base.sha \|\| github.event.repository.default_branch \}\}/);
  assert.match(checkout, /persist-credentials: false/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.doesNotMatch(workflow, /git checkout|gh pr checkout|git reset/);
  assert.match(workflow, /node --import tsx scripts\/pruefer\/pruefer.ts "\$PR" "\$BASE_SHA" "\$HEAD_SHA"/);
});

test("Erstinstallation stoppt vor dem Secret-Schritt, wenn die Basis noch den alten Prüfer enthält", () => {
  const start = workflow.indexOf("run: test -f src/lib/pruefer/git.ts");
  assert.ok(start > 0);
  assert.ok(start < workflow.indexOf("- id: lauf"));
  assert.ok(start < workflow.indexOf("OPENAI_API_KEY:"));
});
