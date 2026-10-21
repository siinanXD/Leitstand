import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

for (const provider of ["codex", "claude"]) test(`echter Reparatur-CLI: ${provider}, 2 Runden, needs-human in beiden Systemen, kein Provider-Wechsel`, () => {
  const dir = mkdtempSync(`${tmpdir()}/repair-cli-`);
  const file = resolve(dir, "state.json");
  const initial = { title: "fix(loop): Probe (SIN-854)", branch: `${provider}/sin-854`, labels: [], comments: [], linearLabels: [], linearComments: [], calls: [], events: [], row: { issue: "SIN-854", claim_revision: 0, reparaturen: 0, claim_provider: provider, claim_id: "worker", claim_at: "2026-10-19T20:00:00Z" } };
  writeFileSync(file, JSON.stringify(initial));
  const run = () => execFileSync(process.execPath, ["--import", "tsx", "--import", resolve("src/lib/loop/fixtures/repair-fetch.mjs"), "scripts/loop/loop.ts", "reparatur", "--pr", "310", "--lauf", "https://github.com/siinanXD/Leitstand/actions/runs/123"], {
    encoding: "utf8", env: { ...process.env, DRY_RUN: "", REPAIR_FIXTURE: file, GH_TOKEN: "fixture", LINEAR_API_KEY: "fixture", GITHUB_REPOSITORY: "siinanXD/Leitstand", SUPABASE_URL: "https://fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture" },
  });
  try {
    run(); run(); run(); run();
    const s = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(s.row.reparaturen, 2);
    assert.equal(s.row.claim_id, null);
    assert.equal(s.comments.filter((c: string) => c.startsWith(`@${provider} `)).length, 2);
    assert.equal(s.comments.some((c: string) => c.startsWith(`@${provider === "codex" ? "claude" : "codex"} `)), false);
    assert.equal(s.comments.filter((c: string) => c.includes("Stopp")).length, 1);
    assert.ok(s.labels.includes("needs-human"));
    assert.deepEqual(s.linearLabels, ["human-label"]);
    assert.equal(s.linearComments.length, 1);
    assert.ok(s.events.some((e: { status: string; grund: string }) => e.status === "fehler" && e.grund.includes("2 Reparaturrunden")));
    // Derselbe dauerhafte Zähler verhindert nach einem Provider-Wechsel die dritte Runde.
    s.branch = `${provider === "codex" ? "claude" : "codex"}/sin-854`;
    s.labels = [];
    writeFileSync(file, JSON.stringify(s));
    run();
    const danach = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(danach.row.reparaturen, 2);
    assert.equal(danach.comments.filter((c: string) => c.startsWith("@")).length, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

for (const [name, labels, runden] of [["pruefer:offen", ["pruefer:offen"], 2], ["pruefer:hoch", ["pruefer:offen", "pruefer:hoch", "risk:high"], 0]] as const) test(`Reparatur nach Prüfer-Fund (SIN-925): ${name} startet ${runden} Runden`, () => {
  const dir = mkdtempSync(`${tmpdir()}/repair-pruefer-`);
  const file = resolve(dir, "state.json");
  writeFileSync(file, JSON.stringify({ title: "fix(loop): Probe (SIN-925)", branch: "claude/sin-925", labels: [...labels], comments: [], linearLabels: [], linearComments: [], calls: [], events: [], row: { issue: "SIN-925", claim_revision: 0, reparaturen: 0, claim_provider: "claude", claim_id: "worker", claim_at: "2026-10-19T20:00:00Z" } }));
  const run = () => execFileSync(process.execPath, ["--import", "tsx", "--import", resolve("src/lib/loop/fixtures/repair-fetch.mjs"), "scripts/loop/loop.ts", "reparatur", "--pr", "310", "--lauf", "https://github.com/siinanXD/Leitstand/actions/runs/124", "--quelle", "pruefer"], {
    encoding: "utf8", env: { ...process.env, DRY_RUN: "", REPAIR_FIXTURE: file, GH_TOKEN: "fixture", LINEAR_API_KEY: "fixture", GITHUB_REPOSITORY: "siinanXD/Leitstand", SUPABASE_URL: "https://fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture" },
  });
  try {
    run(); run(); run();
    const s = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(s.row.reparaturen, runden);
    assert.equal(s.comments.filter((c: string) => c.startsWith("@claude ") && c.includes("Prüfer")).length, runden);
    assert.equal(s.labels.includes("needs-human"), runden > 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
