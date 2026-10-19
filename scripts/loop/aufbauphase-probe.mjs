// SIN-855: führt das echte Workflow-Skript ausschließlich gegen simulierte GitHub-Antworten aus.
// Kein Token, kein Netz, kein echter Merge. Ein grünes Ergebnis ist Integrations-, kein Live-Nachweis.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function probe() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const yaml = readFileSync(new URL("../../.github/workflows/automerge.yml", import.meta.url), "utf8");
  const script = yaml.split("          script: |\n")[1];
  assert.ok(script, "automerge-Skript fehlt");
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const ausfuehren = new AsyncFunction("github", "context", "core", "process", "setTimeout", script.replace(/^            /gm, ""));
  const faelle = [
    { name: "low-alt-2h", datei: "docs/x.md", labels: ["einspruch:2h"], checks: "green", erwartet: "merge" },
    { name: "medium-alt-30m", datei: "src/lib/x.ts", labels: ["einspruch:30m"], checks: "green", erwartet: "merge" },
    { name: "medium-clean-fallback", labels: [], checks: "clean", erwartet: "merge" },
    { name: "high", labels: ["risk:high"], checks: "green", erwartet: "disable" },
    { name: "high-freigegeben", labels: ["risk:high", "freigegeben"], checks: "green", erwartet: "merge" },
    { name: "no-automerge", labels: ["no-automerge", "freigegeben"], checks: "green", erwartet: "disable" },
    { name: "draft", labels: ["freigegeben"], draft: true, checks: "green", erwartet: "disable" },
    { name: "rote-pflichtchecks", labels: ["einspruch:2h"], checks: "red", erwartet: "pending" },
    { name: "laufende-pflichtchecks", labels: [], checks: "pending", erwartet: "pending" },
  ];
  for (const f of faelle) {
    const aufrufe = [];
    let gemergt = false;
    const kommentar = { id: 1, body: '<!-- einspruch --> {"bis":"2099-12-31T23:59:59Z"}' };
    const github = {
      paginate: async () => [{ filename: f.datei ?? "src/lib/x.ts", status: "modified", patch: "+Text" }],
      rest: {
        pulls: {
          listFiles: () => {},
          get: async () => ({ data: pr }),
          merge: async ({ sha }) => {
            aufrufe.push("direct");
            assert.equal(sha, "test-head");
            assert.equal(f.checks, "clean", "Direkt-Merge trotz roter/laufender Pflichtchecks");
            gemergt = true;
          },
        },
        repos: { getContent: async () => ({ data: [] }) },
        issues: {
          removeLabel: async () => {}, addLabels: async () => {},
          listComments: async () => ({ data: [kommentar] }),
          updateComment: async () => {}, createComment: async () => {},
        },
      },
      graphql: async (query) => {
        if (query.includes("disablePullRequestAutoMerge")) { aufrufe.push("disable"); return; }
        assert.ok(query.includes("enablePullRequestAutoMerge"), "Unbekannte Mutation");
        aufrufe.push("enable");
        if (f.checks === "red") throw new Error("Pull request is in unstable status");
        if (f.checks === "clean") throw new Error("Pull request is in clean status");
        // GitHubs Pflichtchecks: ein noch laufender Check erlaubt nur vorgemerkten Auto-Merge.
        gemergt = f.checks === "green";
      },
    };
    const pr = { number: 123, node_id: "test-pr", state: "open", base: { ref: "main" }, draft: f.draft ?? false,
      labels: f.labels.map((name) => ({ name })), body: kommentar.body,
      head: { ref: "dependabot/probe", sha: "test-head", repo: { full_name: "test/test", owner: { login: "test" }, name: "test" } } };
    await ausfuehren(github, { repo: { owner: "test", repo: "test" }, payload: { pull_request: pr } },
      { info() {}, warning() {} }, { env: { GITHUB_WORKSPACE: root } },
      () => { throw new Error("Keine feste Wartefrist erlaubt"); });
    assert.equal(gemergt, f.erwartet === "merge", f.name);
    if (f.erwartet === "disable") assert.deepEqual(aufrufe, ["disable"], f.name);
    if (f.erwartet === "pending") assert.deepEqual(aufrufe, ["enable"], f.name);
  }
  return { ok: true, art: "integration-simuliert", live: false, faelle: faelle.map((f) => f.name) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.env.DRY_RUN, "1", "Nur als DRY_RUN=1 ausführen");
  probe().then((ergebnis) => {
    writeFileSync("/tmp/leitstand-aufbauphase.json", JSON.stringify(ergebnis, null, 2));
    console.log(JSON.stringify(ergebnis));
  }).catch((fehler) => { console.error(fehler); process.exitCode = 1; });
}
