import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workflow = readFileSync(".github/workflows/pruefer.yml", "utf8").replace(/\r\n/g, "\n");
test("SIN-1089: beliebige Same-Repo-Branches mit SIN-Titel erhalten eine Prüfung", async () => {
  const bedingung = workflow.match(/  pruefen:\n    if: (.+)/)![1];
  const job = new Function("github", "startsWith", "contains", `return Boolean(${bedingung});`);
  const script = workflow.match(/          script: \|\n((?:            .*\n)+)/)![1].split("\n").map(s => s.slice(12)).join("\n");
  const ziel = new Function("github", "context", "core", "process", `return (async () => {${script}})();`);
  const automerge = readFileSync(".github/workflows/automerge.yml", "utf8");
  const hatAuftrag = new Function("pr", `return ${automerge.match(/const hatAuftrag = (.+);/)![1]};`);
  const nachlauf = readFileSync("scripts/pruefer/pruefer-nachlauf.ts", "utf8");
  const nachlaufErlaubt = new Function("repo", "pr", `return !(${nachlauf.match(/if \((.+)\) return false;/)![1]});`);
  const repo = { full_name: "siinanXD/Leitstand" };
  const sha = "a".repeat(40);
  for (const ref of ["fix/regel", "feat/regel", "claude/regel", "codex/regel"]) {
    for (const title of ["Fix (SIN-1089)", "Fix (sin-1089)", "Wartung", "XSIN-1089", "SIN-abc", "SIN-1089x"]) {
      for (const fork of [false, true]) {
        const pr = { title, state: "open", draft: false, labels: [], head: { ref, sha, repo: fork ? { full_name: "fork/Leitstand" } : repo }, base: { ref: "main", sha, repo } };
        const ereignis = { ref: "refs/heads/main", event_name: "pull_request_target", head_ref: ref, repository: repo.full_name, event: { action: "opened", pull_request: pr } };
        const startet = job(ereignis, (s: string, prefix: string) => s.startsWith(prefix), (s: string, teil: string) => s.toLowerCase().includes(teil.toLowerCase()));
        assert.equal(nachlaufErlaubt(repo.full_name, pr), !fork && hatAuftrag(pr));
        const pruefung = ziel({ rest: { pulls: { get: async () => ({ data: pr }) }, repos: { getBranch: async () => ({ data: { protected: true, commit: { sha } } }) } } }, { eventName: "pull_request_target", ref: "refs/heads/main", sha, repo: { owner: "siinanXD", repo: "Leitstand" }, payload: { repository: { default_branch: "main" } } }, { setOutput: () => {} }, { env: { PR: "474" } });
        if (!fork && hatAuftrag(pr)) {
          assert.equal(startet, true, `${ref}: ${title}`);
          await pruefung;
        } else {
          if (fork) assert.equal(startet, false);
          await assert.rejects(pruefung);
        }
      }
    }
  }
});

test("Abo-only-Workflow reicht keine Modell-API-Zugangsdaten oder API-Modellkonfiguration weiter", () => {
  assert.doesNotMatch(workflow, /OPENAI_API_KEY|ANTHROPIC_API_KEY|PRUEFER_PREIS_|PRUEFER_CLAUDE_MODELL/);
});
test("Alle nativen Anstöße sind serialisiert und neue Basis muss die native CLI besitzen", () => {
  assert.match(workflow, /group: pruefer-abo\n  cancel-in-progress: false/);
  assert.match(workflow, /test -f src\/lib\/pruefer\/codex.ts/);
});
test("Native Folgerunden laufen auf main; fehlender Review ist kein automatischer Reparaturfehler", () => {
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /pruefer-nachlauf.ts/);
  assert.match(workflow, /steps.lauf.outputs.wartend != 'true'/);
});

test("Globale Serialisierung erhält mehrere wartende Prüfläufe statt sie gegenseitig zu ersetzen", () => {
  const abschnitt = workflow.split("concurrency:\n")[1].split("jobs:\n")[0];
  assert.match(abschnitt, /queue: max/);
  assert.match(abschnitt, /cancel-in-progress: false/);
});
