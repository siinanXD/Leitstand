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
