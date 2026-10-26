// SIN-855: echtes Workflow-Skript gegen simulierte APIs, ohne Netz oder echten Merge.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { kriterienHash, standMarker } from "./beleg-stand.mjs";

const sha = "a".repeat(40);
const issue = { identifier: "SIN-855", title: "Auftrag", description: "1. Altfristen sperren nicht" };
const faelle = [
  { name: "low-alt-2h", datei: "docs/x.md", labels: ["einspruch:2h"], checks: "green", erwartet: "merge" },
  { name: "medium-alt-30m", labels: ["einspruch:30m"], checks: "green", erwartet: "merge" },
  { name: "medium-ohne-altmarker", labels: [], checks: "green", erwartet: "merge" },
  { name: "high", labels: ["risk:high"], checks: "green", erwartet: "disable" },
  { name: "high-freigegeben", labels: ["risk:high", "freigegeben"], checks: "green", erwartet: "merge" },
  { name: "no-automerge", labels: ["no-automerge", "freigegeben"], checks: "green", erwartet: "disable" },
  { name: "draft", labels: ["freigegeben"], draft: true, checks: "green", erwartet: "disable" },
  { name: "rote-pflichtchecks", labels: ["einspruch:2h"], checks: "red", erwartet: "pending" },
  { name: "laufende-pflichtchecks", labels: [], checks: "pending", erwartet: "pending" },
  { name: "ohne-linear-zuordnung", labels: [], ohneIssue: true, checks: "green", erwartet: "disable" },
  { name: "ohne-linear-freigegeben", labels: ["freigegeben"], ohneIssue: true, checks: "green", erwartet: "merge" },
];

/** Prüft einen Fall mit aktuellem Build und offiziellem, SHA-gebundenem Beleg. */
async function pruefeFall(ausfuehren, fall) {
  let gemergt = false;
  const aufrufe = [];
  const kommentar = { id: 1, body: '<!-- einspruch --> {"bis":"2099-12-31T23:59:59Z"}' };
  const hash = kriterienHash(`${issue.identifier}\n${issue.title}\n${issue.description}`);
  const belege = [kommentar, { user: { login: "test" }, body: `<!-- pruefer-zweites-modell -->\n### Prüfer (zweites Modell): bestanden\n${standMarker(sha, hash)}` }];
  const pr = { number: 123, node_id: "test-pr", state: "open", title: fall.ohneIssue ? "Wartung" : "fix(loop): Probe (SIN-855)",
    base: { ref: "main" }, draft: fall.draft ?? false, labels: fall.labels.map((name) => ({ name })), body: kommentar.body,
    head: { ref: fall.ohneIssue ? "dependabot/probe" : "codex/sin-855", sha, repo: { full_name: "test/test" } } };
  const listFiles = () => {};
  const github = {
    paginate: async (methode) => methode === listFiles ? [{ filename: fall.datei ?? "src/lib/x.ts", status: "modified", patch: "+Text" }] : belege,
    rest: {
      pulls: { listFiles, get: async () => ({ data: pr }), merge: async (args) => {
        assert.equal(args.sha, sha);
        assert.equal(fall.checks, "green", "Merge trotz roter/laufender Pflichtchecks");
        gemergt = true;
      } },
      checks: { listForRef: async () => ({ data: { check_runs: [{ id: 1, name: "build", head_sha: sha,
        status: fall.checks === "pending" ? "in_progress" : "completed", conclusion: fall.checks === "green" ? "success" : "failure" }] } }) },
      repos: { getContent: async () => ({ data: [] }) },
      issues: { removeLabel: async () => {}, addLabels: async () => {}, listComments: async () => ({ data: belege }),
        updateComment: async () => {}, createComment: async () => {} },
    },
    graphql: async (query) => {
      assert.ok(query.includes("disablePullRequestAutoMerge"), "Kein ausstehender Auto-Merge erlaubt");
      aufrufe.push("disable");
    },
  };
  await ausfuehren(github, { repo: { owner: "test", repo: "test" }, payload: { pull_request: pr } },
    { info() {}, warning() {} }, { env: { GITHUB_WORKSPACE: new URL("../../", import.meta.url).href.replace(/\/$/, ""), LINEAR_API_KEY: "fixture" } },
    () => { throw new Error("Keine feste Wartefrist erlaubt"); });
  assert.equal(gemergt, fall.erwartet === "merge", fall.name);
  assert.deepEqual(aufrufe, fall.erwartet === "disable" ? ["disable", "disable"] : ["disable"], fall.name);
}

/** Führt alle Schutzfälle ohne Netzwerkzugriff aus und stellt fetch anschließend wieder her. */
export async function probe() {
  const yaml = readFileSync(new URL("../../.github/workflows/automerge.yml", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const script = yaml.split("          script: |\n")[1];
  assert.ok(script, "automerge-Skript fehlt");
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const ausfuehren = new AsyncFunction("github", "context", "core", "process", "setTimeout", script.replace(/^            /gm, ""));
  const vorher = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, "https://api.linear.app/graphql");
    return new Response(JSON.stringify({ data: { issue } }));
  };
  try {
    for (const fall of faelle) await pruefeFall(ausfuehren, fall);
    return { ok: true, art: "integration-simuliert", live: false, faelle: faelle.map((fall) => fall.name) };
  } finally { globalThis.fetch = vorher; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.env.DRY_RUN, "1", "Nur als DRY_RUN=1 ausführen");
  probe().then((ergebnis) => {
    writeFileSync("/tmp/leitstand-aufbauphase.json", JSON.stringify(ergebnis, null, 2));
    console.log(JSON.stringify(ergebnis));
  }).catch((fehler) => { console.error(fehler); process.exitCode = 1; });
}
