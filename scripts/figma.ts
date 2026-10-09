/**
 * Figma lesen (SIN-428). Nur lesen, Token `FIGMA_ACCESS_TOKEN`.
 *   npx tsx scripts/figma.ts --node 35:2 [--file KEY]   Werte (Größen, Abstände, Farben, Texte, Schrift) als JSON
 *   npx tsx scripts/figma.ts --bild 35:2 [--file KEY]   PNG in den Temp-Ordner, gibt den Pfad aus (mit Read ansehen)
 * Ohne Token: „nicht verfügbar“, Exit 0.
 */
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_FILE_KEY, knotenBild, knotenWerte, NICHT_VERFUEGBAR } from "../src/lib/figma";

const argv = process.argv.slice(2);
const arg = (n: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const fileKey = arg("--file") ?? DEFAULT_FILE_KEY;

async function main() {
  const node = arg("--node");
  const bild = arg("--bild");
  if (node) {
    const w = await knotenWerte(fileKey, node, process.env, fetch);
    return console.log(w ? JSON.stringify(w, null, 2) : NICHT_VERFUEGBAR);
  }
  if (bild) {
    const png = await knotenBild(fileKey, bild, process.env, fetch);
    if (!png) return console.log(NICHT_VERFUEGBAR);
    const pfad = join(tmpdir(), `figma-${bild.replace(/[^0-9a-z]/gi, "-")}.png`);
    writeFileSync(pfad, png);
    return console.log(pfad);
  }
  throw new Error("Aufruf: --node ID oder --bild ID [--file KEY]");
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
