/**
 * SIN-905: Gibt die Testdateien aus, die zu den Änderungen eines PR gehören (eine je Zeile),
 * oder `ALLE`, wenn die volle Testreihe laufen soll. Aufruf: `tsx scripts/ci/betroffene-tests.ts <basis-ref>`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { betroffeneTests, importPfade } from "../../src/lib/ci/betroffene-tests";

const basis = process.argv[2];
if (!basis) {
  console.log("ALLE");
  process.exit(0);
}
const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8" }).split("\n").filter(Boolean);

const geaendert = git("diff", "--name-only", "--diff-filter=ACMR", `${basis}...HEAD`);
const quellen = /\.(m?[jt]sx?)$/;
const dateien = new Set(git("ls-files", "--", "src", "scripts", "package.json", "tsconfig.json").filter(f => quellen.test(f) || f.endsWith(".json")));
const importe: Record<string, string[]> = {};
for (const d of dateien) if (quellen.test(d)) importe[d] = importPfade(readFileSync(d, "utf8"));

const r = betroffeneTests(geaendert, importe, dateien);
console.error(`SIN-905: ${r.grund}`);
console.log(r.alle ? "ALLE" : r.tests.join("\n"));
