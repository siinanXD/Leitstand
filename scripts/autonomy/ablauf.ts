/**
 * Schreibt docs/ABLAUF.md aus docs/autonomy/agents.json (SIN-543). Aufruf: npx tsx scripts/autonomy/ablauf.ts
 * Der Test src/lib/autonomy/ablauf.test.ts schlägt an, wenn die Datei nicht zum Register passt.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { ablaufMarkdown, registerFehler, type Register } from "../../src/lib/autonomy/ablauf";

const register = JSON.parse(readFileSync("docs/autonomy/agents.json", "utf8")) as Register;
const fehler = registerFehler(register);
if (fehler.length) {
  console.error(`agents.json ungültig:\n- ${fehler.join("\n- ")}`);
  process.exit(1);
}
writeFileSync("docs/ABLAUF.md", ablaufMarkdown(register));
console.log("docs/ABLAUF.md geschrieben.");
