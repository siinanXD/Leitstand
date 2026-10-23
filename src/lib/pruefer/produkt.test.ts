// SIN-939: Ein Prüfer für alle Produkt-Repos. Der Prüfer liest fremde Diffs nur; das Produkt-Gate verlangt den Beleg.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lesePrDiff } from "./git";
import { prueferBeleg } from "../../../scripts/pruefer/beleg-gate.mjs";
import { kriterienHash, standMarker } from "../../../scripts/loop/beleg-stand.mjs";

const workflow = readFileSync(".github/workflows/pruefer.yml", "utf8");
const script = workflow.match(/          script: \|\n((?:            .*\n)+)/)![1].split("\n").map((s) => s.slice(12)).join("\n");
const ausfuehren = new Function("github", "context", "core", "process", `return (async () => {${script}})();`);
const LERNAPP = "siinanXD/Content-Agent-Lernapp";
const sha = (c: string) => c.repeat(40);

async function ziel(repo: string, eventName: string, optionen: { geschuetzt?: boolean; headRepo?: string } = {}) {
  const outputs: Record<string, string> = {};
  const data = { state: "open", draft: false, head: { repo: { full_name: optionen.headRepo ?? repo }, ref: "claude/sin-939", sha: sha("a") }, base: { repo: { full_name: repo }, ref: "main", sha: sha("c") } };
  const abgefragt: string[] = [];
  await ausfuehren(
    { rest: { pulls: { get: async () => ({ data }) }, repos: { getBranch: async (a: { repo: string }) => (abgefragt.push(a.repo), { data: { protected: a.repo === "Leitstand" || optionen.geschuetzt !== false, commit: { sha: sha("b") } } }) } } },
    { repo: { owner: "siinanXD", repo: "Leitstand" }, eventName, ref: "refs/heads/main", sha: sha("b"), payload: { repository: { default_branch: "main" } } },
    { setOutput: (k: string, v: string) => { outputs[k] = v; } },
    { env: { PR: "12", GH_REPO: repo } },
  );
  return { outputs, abgefragt };
}

test("Prüfer nimmt repo und PR per workflow_dispatch und repository_dispatch, Lern-App wie Leitstand", async () => {
  assert.match(workflow, /\n  repository_dispatch:\n    types: \[pruefer-anstoss\]\n/);
  assert.match(workflow, /workflow_dispatch:\n    inputs:\n      pr:[\s\S]*\n      repo:\n/);
  for (const event of ["workflow_dispatch", "repository_dispatch"]) {
    const { outputs, abgefragt } = await ziel(LERNAPP, event);
    assert.deepEqual(outputs, { basis: sha("b"), head: sha("a"), pr_basis: sha("c") });
    assert.deepEqual(abgefragt, ["Leitstand", "Content-Agent-Lernapp"], "geschützter Prüfer-main und main des Produkts");
  }
  assert.deepEqual((await ziel("siinanXD/Leitstand", "repository_dispatch")).outputs.basis, sha("b"));
});

test("Fremde Repos: nur freigegebene Produkte, nie per PR-Ereignis, nie Forks, nur mit geschütztem main", async () => {
  for (const repo of ["siinanXD/anderes-Repo", "fremd/Content-Agent-Lernapp", "siinanXD/Content-Agent-Lernapp/../x", "siinanXD/Leitstand; id"]) {
    await assert.rejects(ziel(repo, "repository_dispatch"), /nicht freigegeben/);
  }
  await assert.rejects(ziel(LERNAPP, "pull_request_target"), /nur aus diesem Repository/);
  await assert.rejects(ziel(LERNAPP, "repository_dispatch", { headRepo: "fork/Content-Agent-Lernapp" }), /demselben Repository/);
  await assert.rejects(ziel(LERNAPP, "repository_dispatch", { geschuetzt: false }), /Ziel-Repos ist nicht geschützt/);
});

test("Prüfer checkt nie das Produkt aus: Checkout nur Prüfer-Basis, Diff per Fetch, Ergebnis im Produkt-PR", () => {
  assert.doesNotMatch(workflow, /^\s+repository:/m, "kein actions/checkout eines anderen Repos");
  assert.match(workflow, /fetch --no-tags "https:\/\/github\.com\/\$GH_REPO" "\$BASE_SHA" "\$HEAD_SHA"/);
  assert.match(workflow, /BASE_SHA: \$\{\{ env\.GH_REPO == github\.repository && steps\.ziel\.outputs\.basis \|\| steps\.ziel\.outputs\.pr_basis \}\}/);
  assert.match(workflow, /GH_REPO: \$\{\{ github\.event\.client_payload\.repo \|\| inputs\.repo \|\| github\.repository \}\}/);
  assert.match(workflow, /gh pr comment "\$PR" --body-file pruefer-kommentar\.md/);
  assert.match(workflow, /"\$\{\{ github\.event_name \}\}" = "repository_dispatch"/, "Labels auch bei Anstoß aus dem Produkt");
});

test("Prüfer liest den Diff eines fremden Repos nur lesend", () => {
  const wurzel = mkdtempSync(join(tmpdir(), "pruefer-fremd-"));
  const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
  const fremd = join(wurzel, "lernapp"), eigen = join(wurzel, "leitstand");
  try {
    for (const d of [fremd, eigen]) { mkdirSync(d); git(d, "init", "-q"); git(d, "config", "user.email", "t@example.invalid"); git(d, "config", "user.name", "t"); }
    writeFileSync(join(eigen, "README.md"), "Prüfer\n"); git(eigen, "add", "."); git(eigen, "commit", "-qm", "main");
    const eigenHead = git(eigen, "rev-parse", "HEAD");
    writeFileSync(join(fremd, "a.txt"), "alt\n"); git(fremd, "add", "."); git(fremd, "commit", "-qm", "basis");
    const basis = git(fremd, "rev-parse", "HEAD");
    writeFileSync(join(fremd, "package.json"), JSON.stringify({ scripts: { postinstall: "node -e \"require('node:fs').writeFileSync('ausgefuehrt','ja')\"" } }));
    writeFileSync(join(fremd, "a.txt"), "neu\n"); git(fremd, "add", "."); git(fremd, "commit", "-qm", "PR");
    const head = git(fremd, "rev-parse", "HEAD");
    git(eigen, "fetch", "--no-tags", fremd, basis, head);
    const d = lesePrDiff(basis, head, eigen);
    assert.deepEqual(d.dateien, ["a.txt", "package.json"]);
    assert.match(d.diff, /\+neu/);
    assert.equal(git(eigen, "rev-parse", "HEAD"), eigenHead, "kein Checkout");
    assert.equal(git(eigen, "status", "--porcelain"), "", "Arbeitsverzeichnis unverändert");
    assert.equal(existsSync(join(eigen, "a.txt")), false);
    assert.equal(existsSync(join(eigen, "ausgefuehrt")), false);
  } finally { rmSync(wurzel, { recursive: true, force: true }); }
});

test("Lern-App-PR ohne Prüfer-Beleg wird nicht gemergt", () => {
  const hash = kriterienHash("SIN-939\nTitel\nBeschreibung");
  const head = sha("a");
  const absender = ["siinanXD", "github-actions[bot]"];
  const kommentar = (haken: string, stand: string, login = "github-actions[bot]") => ({ user: { login }, body: `<!-- pruefer-zweites-modell -->\n### Prüfer (zweites Modell): ${haken}\n\n${stand}` });
  const pruefe = (kommentare: unknown[], h = head, k = hash) => prueferBeleg({ kommentare, headSha: h, hash: k, absender });

  assert.equal(pruefe([]).ok, false, "kein Prüfer-Kommentar");
  assert.equal(pruefe([{ user: { login: "github-actions[bot]" }, body: "Build grün" }]).ok, false, "anderer Kommentar");
  assert.equal(pruefe([kommentar("bestanden", standMarker(head, hash), "fremd")]).ok, false, "Beleg von Fremden zählt nicht");
  assert.equal(pruefe([kommentar("nicht bestanden", standMarker(head, hash))]).ok, false, "Funde offen");
  assert.equal(pruefe([kommentar("bestanden", standMarker(sha("d"), hash))]).ok, false, "Beleg für alten Head");
  assert.equal(pruefe([kommentar("bestanden", standMarker(head, hash))], head, kriterienHash("geändert")).ok, false, "Kriterien geändert");
  assert.equal(pruefe([kommentar("bestanden", standMarker(head, hash)), kommentar("nicht bestanden", standMarker(head, hash))]).ok, false, "jüngster Kommentar zählt");
  assert.equal(pruefe([kommentar("bestanden", standMarker(head, hash))]).ok, true);
});
