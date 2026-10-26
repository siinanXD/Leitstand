import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { GET } from "./route";

test("ohne Sitzung 401, und die Antwort enthält kein Token", async () => {
  process.env.FIGMA_ACCESS_TOKEN = "geheim-figd-123";
  const res = await GET(new Request("http://x/api/figma-bild?node=21:2"));
  assert.equal(res.status, 401);
  assert.ok(!(await res.text()).includes("geheim-figd-123"));
  delete process.env.FIGMA_ACCESS_TOKEN;
});

test("Token nie im Client: keine Datei unter src/app/bilder nennt FIGMA_ACCESS_TOKEN", () => {
  const dateien = readdirSync("src/app/bilder");
  assert.ok(dateien.length > 0);
  for (const d of dateien) assert.ok(!readFileSync(`src/app/bilder/${d}`, "utf8").includes("FIGMA_ACCESS_TOKEN"), d);
});
