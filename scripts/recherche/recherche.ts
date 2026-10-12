/**
 * Vor-Recherche für einen Produktwunsch (SIN-488).
 * Aufruf: npx tsx scripts/recherche/recherche.ts "<Wunsch>"   (DRY_RUN=1 zeigt nur Auftrag und Zielpfad)
 * Läuft mit dem Claude-Abo (CLAUDE_CODE_OAUTH_TOKEN) und Websuche, mit festem Rundenbudget. Legt nie Repo, Projekt oder Issue an.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { MAX_RUNDEN, auftrag, berichtsPfad, empfehlungAus, pruefeBericht } from "../../src/lib/recherche/recherche";

const wunsch = process.argv.slice(2).join(" ").trim();
if (!wunsch) {
  console.error('Aufruf: npx tsx scripts/recherche/recherche.ts "<Wunsch>"');
  process.exit(2);
}

const jetzt = new Date();
const text = auftrag(wunsch, jetzt);
const pfad = berichtsPfad(wunsch);

if (process.env.DRY_RUN) {
  console.log(`Trockenlauf. Bericht würde nach ${pfad} geschrieben, Budget ${MAX_RUNDEN} Runden.\n\n${text}`);
  process.exit(0);
}

const lauf = spawnSync("claude", ["-p", text, "--max-turns", String(MAX_RUNDEN), "--allowedTools", "WebSearch,WebFetch", "--output-format", "text"], { encoding: "utf8", maxBuffer: 10_000_000 });
if (lauf.status !== 0) {
  console.error(`claude fehlgeschlagen (${lauf.status}): ${lauf.stderr.slice(0, 500)}`);
  process.exit(1);
}

const bericht = lauf.stdout.trim() + "\n";
const maengel = pruefeBericht(bericht);
if (maengel.length) {
  console.error(`Bericht verworfen:\n- ${maengel.join("\n- ")}`);
  process.exit(1);
}

mkdirSync(dirname(pfad), { recursive: true });
writeFileSync(pfad, bericht);
console.log(`Bericht: ${pfad} (Empfehlung: ${empfehlungAus(bericht)}). Wartet auf Sinans Entscheidung „Bauen“ oder „Verwerfen“.`);
