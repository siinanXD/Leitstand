/**
 * Prüft die JSON-Ausgabe einer Rolle gegen docs/schemas/<rolle>.json (SIN-543).
 * Aufruf: npx tsx scripts/autonomy/schema.ts <rolle> <datei>. Exit 1 bei ungültigem JSON: Lauf rot, Issue bleibt offen.
 */
import { readFileSync } from "node:fs";
import { pruefeSchema, type Schema } from "../../src/lib/autonomy/schema";

const [rolle, datei] = process.argv.slice(2);
if (!rolle || !datei || !/^[a-z]+$/.test(rolle)) {
  console.error("Aufruf: npx tsx scripts/autonomy/schema.ts <rolle> <datei>");
  process.exit(2);
}

let wert: unknown;
try {
  wert = JSON.parse(readFileSync(datei, "utf8"));
} catch (e) {
  console.error(`${datei}: kein gültiges JSON (${(e as Error).message})`);
  process.exit(1);
}
const fehler = pruefeSchema(wert, JSON.parse(readFileSync(`docs/schemas/${rolle}.json`, "utf8")) as Schema);
if (fehler.length) {
  console.error(`${datei} passt nicht zu docs/schemas/${rolle}.json:\n- ${fehler.join("\n- ")}`);
  process.exit(1);
}
console.log(`${datei}: gültig (${rolle}).`);
