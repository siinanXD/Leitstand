import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

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
    assert.deepEqual(await ziel(pr(ref)), { basis: "b".repeat(40), head: "a".repeat(40), pr_basis: "b".repeat(40) });
    assert.ok(workflow.includes(`startsWith(github.head_ref, '${ref.split("/")[0]}/')`));
  }
});

test("Veraltetes PR-Ereignis darf keinen inzwischen anderen Head oder Basisstand prüfen", async () => {
  const event = pr();
  await assert.rejects(ziel({ ...pr(), head: { ...pr().head, sha: "c".repeat(40) } }, "pull_request_target", "827", event), /veraltet/);
  await assert.rejects(ziel({ ...pr(), base: { ...pr().base, sha: "c".repeat(40) } }, "pull_request_target", "827", event), /veraltet/);
  assert.deepEqual(await ziel(pr(), "pull_request_target", "827", event), { basis: "b".repeat(40), head: "a".repeat(40), pr_basis: "b".repeat(40) });
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
  assert.deepEqual(await ziel({ ...pr(), draft: true }, "workflow_dispatch"), { basis: "b".repeat(40), head: "a".repeat(40), pr_basis: "b".repeat(40) });
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

test("Draft-Basiswechsel erreicht die Entwertung, normale Draft-Ereignisse und Titeländerungen nicht", async () => {
  const bedingung = workflow.match(/  pruefen:\n    if: (.+)/)![1];
  const job = new Function("github", "startsWith", `return Boolean(${bedingung});`);
  const ereignis = (draft: boolean, action: string, basiswechsel = false, fremd = false) => ({
    ref: "refs/heads/main", event_name: "pull_request_target", head_ref: "codex/sin-827", repository: repo.full_name,
    event: { action, changes: basiswechsel ? { base: {} } : {}, pull_request: { draft, head: { repo: fremd ? { full_name: "fremd/Leitstand" } : repo } } },
  });
  const startet = (g: ReturnType<typeof ereignis>) => job(g, (s: string, prefix: string) => s.startsWith(prefix));
  assert.equal(startet(ereignis(true, "edited", true)), true);
  assert.equal(startet(ereignis(false, "edited", true)), true);
  for (const g of [ereignis(true, "synchronize"), ereignis(true, "edited"), ereignis(false, "edited"), ereignis(true, "edited", true, true)]) assert.equal(startet(g), false);
  assert.equal(startet(ereignis(false, "ready_for_review")), true);
  await assert.rejects(ziel({ ...pr(), draft: true }), /Draft/);
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


test("Veröffentlichung wählt über alle Seiten den neuesten eigenen offiziellen Prüfer-Kommentar", () => {
  const line = workflow.split("\n").find(line => line.includes("ALT=$(gh api"))!;
  const query = line.match(/--jq '([^']+)'/)![1].replaceAll("${{ github.repository_owner }}", "siinanXD");
  const prefix = "<!-- pruefer-zweites-modell -->\n";
  const pages = [
    [{ id: 1, user: { login: "siinanXD" }, body: prefix + "früher bestanden" }, { id: 3, user: { login: "github-actions[bot]" }, body: prefix + "später nicht bestanden" }],
    [{ id: 7, user: { login: "siinanXD" }, body: prefix + "neuester offizieller Review" }, { id: 9, user: { login: "fremd" }, body: prefix + "fremder Marker" }, { id: 10, user: { login: "github-actions[bot]" }, body: "anderer Kommentar" }],
  ];
  // gh --paginate --jq wendet den Filter je Seite an; `tail -n 1` nimmt die letzte Treffer-ID.
  const jq = (seiten: unknown[][]) => seiten.map((s) => execFileSync("jq", ["-r", query], { input: JSON.stringify(s), encoding: "utf8" })).join("").trim().split("\n").filter(Boolean).at(-1) ?? "";
  assert.equal(jq(pages), "7");
  assert.equal(jq([[pages[1][1]]]), "", "Fremde Marker werden niemals überschrieben");
  assert.match(line, /--paginate --jq/);
  assert.match(line, /\| tail -n 1\)$/);
  assert.doesNotMatch(line, /--slurp/, "gh lehnt --slurp mit --jq ab (SIN-872)");
  assert.doesNotMatch(line, /head -1/);
});

test("SIN-872: kein gh --slurp zusammen mit -q/--jq in Workflows", () => {
  const dir = new URL("../../../.github/workflows/", import.meta.url);
  for (const f of readdirSync(dir)) {
    for (const zeile of readFileSync(new URL(f, dir), "utf8").split("\n")) {
      assert.ok(!(/--slurp/.test(zeile) && /(\s-q\s|--jq)/.test(zeile)), `${f}: ${zeile.trim()}`);
    }
  }
});

test("SIN-880: alter PR-Basis-Snapshot nutzt weiterhin den aktuellen geschützten Prüfer", async () => {
  const alt = { ...pr(), base: { ...pr().base, sha: "c".repeat(40) } };
  for (const event of ["workflow_dispatch", "pull_request_target"]) {
    assert.deepEqual(await ziel(alt, event, "308", event === "pull_request_target" ? alt : undefined), {
      basis: "b".repeat(40), head: "a".repeat(40), pr_basis: "c".repeat(40),
    });
  }
});

test("SIN-880: echter Veröffentlichungs-Guard sperrt geänderten Head, Ziel, Snapshot und main", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pruefer-publish-"));
  const block = workflow.split('          AKTUELL=$(gh api')[1].split('          ALT=')[0];
  const guard = ('AKTUELL=$(gh api' + block).replaceAll('${{ github.repository }}', repo.full_name);
  try {
    writeFileSync(join(cwd, "gh"), '#!/bin/sh\ncase "$*" in *branches/main*) printf "%s" "$FIXTURE_MAIN";; *) printf "%s" "$FIXTURE_PR";; esac\n', { mode: 0o755 });
    const head = "a".repeat(40), base = "b".repeat(40), snapshot = "c".repeat(40);
    const current = `${head} ${snapshot} main ${repo.full_name} ${repo.full_name} open`;
    for (const [pr, main, ok] of [
      [current, `${base} true`, true],
      [current.replace(head, "d".repeat(40)), `${base} true`, false],
      [current.replace(snapshot, base), `${base} true`, false],
      [current.replace(" main ", " unsafe "), `${base} true`, false],
      [current.replace(repo.full_name, "fork/Leitstand"), `${base} true`, false],
      [current, `${snapshot} true`, false],
      [current.replace(" open", " closed"), `${base} true`, false],
      [current.replace(`${repo.full_name} open`, "fork/Leitstand open"), `${base} true`, false],
      [current, `${base} false`, false],
    ] as const) {
      const r = spawnSync("bash", ["-e", "-c", guard], { cwd, encoding: "utf8", env: {
        ...process.env, PATH: `${cwd}:${process.env.PATH}`, PR: "308", BASE_SHA: base, HEAD_SHA: head,
        PR_BASE_SHA: snapshot, FIXTURE_PR: pr, FIXTURE_MAIN: main,
      } });
      assert.equal(r.status, ok ? 0 : 1, `${pr} / ${main}: ${r.stderr}`);
    }
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("SIN-932: Auto-Merge bricht den PR-Prüfer nicht ab, repair kennt dispatchte Prüfer-Läufe", () => {
  const automerge = readFileSync(".github/workflows/automerge.yml", "utf8");
  const repair = readFileSync(".github/workflows/repair.yml", "utf8");
  assert.match(workflow, /\nrun-name: pruefer PR \$\{\{ github\.event\.pull_request\.number \|\| inputs\.pr \}\}\n/);
  assert.match(automerge, /prueferLaeuftSchon = context\.eventName === "pull_request_target" && \["opened", "reopened", "synchronize", "ready_for_review"\]/);
  assert.match(automerge, /!angefordert && context\.eventName !== "issue_comment" && !prueferLaeuftSchon/);
  assert.match(repair, /\["pull_request_target","workflow_dispatch"\]/);
  const sed = repair.match(/sed -nE '([^']+)'/)![1];
  const nummer = (titel: string) => execFileSync("sed", ["-nE", sed], { input: titel, encoding: "utf8" }).trim();
  assert.equal(nummer("pruefer PR 356"), "356");
  assert.equal(nummer("pruefer PR 356; rm -rf /"), "");
  assert.equal(nummer("build"), "");
});
