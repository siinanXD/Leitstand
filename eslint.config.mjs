import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import sauberkeit from "./scripts/sauberkeit/doku-regel.mjs";

// SIN-1063: Sauberkeits-Regeln gelten als Fehler nur für die Dateien, die der PR ändert.
// scripts/sauberkeit/pruefen.ts setzt SAUBERKEIT_DATEIEN (eine Datei je Zeile).
const geaendert = (process.env.SAUBERKEIT_DATEIEN ?? "").split("\n").filter(Boolean);
const dokuDateien = geaendert.filter((d) => d.startsWith("src/lib/") && !d.endsWith(".test.ts"));
const sauberkeitsRegeln = {
  complexity: ["error", 15],
  "max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true }],
  "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  ...(geaendert.length ? [{ files: geaendert, rules: sauberkeitsRegeln }] : []),
  ...(dokuDateien.length
    ? [{ files: dokuDateien, plugins: { sauberkeit }, rules: { "sauberkeit/doku-satz": "error" } }]
    : []),
]);

export default eslintConfig;
