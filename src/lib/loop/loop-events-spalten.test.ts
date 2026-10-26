import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Spalten von public.loop_events (Stand 26.10.2026, information_schema). Eine nicht vorhandene Spalte im select ergibt HTTP 400.
const SPALTEN = new Set(["id", "project", "step", "issue", "pr", "status", "run_id", "run_url", "duration_ms", "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "cost_usd", "created_at", "agent", "grund", "payload", "wirkung"]);

const dateien = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? dateien(p) : /\.tsx?$/.test(n) && !n.includes(".test.") ? [p] : [];
  });

test("jede loop_events-Abfrage wählt nur vorhandene Spalten (cost heißt cost_usd)", () => {
  // shortcut: erfasst nur `loop_events?…select=` in einem String; getrennt gebaute URLs (scripts/score/score.ts) nicht, ausbauen bei nächstem Fund.
  const fehler: string[] = [];
  for (const datei of [...dateien("scripts"), ...dateien("src")]) {
    for (const m of readFileSync(datei, "utf8").matchAll(/loop_events\?[^`"'\s]*?select=([a-z_:,]+)/g)) {
      // `alias:spalte` liest die Spalte nach dem Doppelpunkt.
      for (const s of m[1].split(",").filter(Boolean).map((t) => t.split(":").pop()!)) if (!SPALTEN.has(s)) fehler.push(`${datei}: ${s}`);
    }
  }
  assert.deepEqual(fehler, []);
});
