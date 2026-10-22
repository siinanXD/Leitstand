import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("Zusätzliche Dokurechte sind auf zwei Context7-Tools und offizielle Web-Domains begrenzt", () => {
  const workflow = readFileSync(".github/workflows/claude.yml", "utf8");
  const config = JSON.parse(workflow.match(/--mcp-config '([^']+)'/)?.[1] ?? "null");
  assert.deepEqual(config, { mcpServers: { context7: { type: "http", url: "https://mcp.context7.com/mcp" } } });
  assert.match(workflow, /--strict-mcp-config/);
  const tools = workflow.match(/--allowedTools "([^"]+)"/)?.[1].split(",") ?? [];
  assert.deepEqual(tools.filter((t) => t.startsWith("mcp__")), ["mcp__context7__resolve-library-id", "mcp__context7__query-docs"]);
  assert.deepEqual(tools.filter((t) => t.startsWith("Web")), [
    "WebFetch(domain:nextjs.org)", "WebFetch(domain:supabase.com)", "WebFetch(domain:developers.openai.com)",
    "WebFetch(domain:platform.openai.com)", "WebFetch(domain:code.claude.com)", "WebFetch(domain:docs.anthropic.com)",
    "WebFetch(domain:playwright.dev)", "WebFetch(domain:docs.revideo.ai)",
  ]);
  assert.doesNotMatch(workflow, /CONTEXT7_API_KEY|bypassPermissions|dangerously-skip-permissions/);
});

test("Worker darf das Gedächtnis lesen, das der Prompt verlangt, und sonst kein gh api (SIN-615)", () => {
  const workflow = readFileSync(".github/workflows/claude.yml", "utf8");
  const tools = workflow.match(/--allowedTools "([^"]+)"/)?.[1].split(",") ?? [];
  assert.deepEqual(tools.filter((t) => t.startsWith("Bash(gh api")), ["Bash(gh api repos/siinanXD/gedaechtnis/contents:*)"]);
  // Jeder gh-api-Aufruf im Prompt muss von dieser Freigabe gedeckt sein, sonst verweigert der Headless-Lauf ihn still.
  for (const m of workflow.matchAll(/gh api (\S+)/g)) assert.ok(m[1].startsWith("repos/siinanXD/gedaechtnis/contents"), m[1]);
});
