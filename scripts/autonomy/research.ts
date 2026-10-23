/**
 * Research-Lauf (SIN-543). Aufruf: npx tsx scripts/autonomy/research.ts SIN-543 "<Suchwort>"
 * Fragt die öffentliche Hugging-Face-Hub-API (ohne Token) und die GitHub-Suche (GITHUB_TOKEN optional) ab
 * und schreibt docs/decisions/<ISSUE-ID>-research.md sowie das Rollen-Ergebnis docs/autonomy/laeufe/<ISSUE-ID>.json (SIN-1045; der Workflow prüft es danach mit schema.ts).
 * DRY_RUN=1 zeigt nur die Abfragen.
 */
import { writeFileSync } from "node:fs";
import { rollenErgebnis, schreibeErgebnis } from "../../src/lib/strukturiert/ergebnis";
import { GITHUB_URL, HF_URL, entscheidungsdatei, githubTreffer, huggingfaceTreffer } from "../../src/lib/autonomy/research";

const [issue, ...rest] = process.argv.slice(2);
const frage = rest.join(" ").trim();
if (!issue || !frage) {
  console.error('Aufruf: npx tsx scripts/autonomy/research.ts SIN-543 "<Suchwort>"');
  process.exit(2);
}

const q = encodeURIComponent(frage);
if (process.env.DRY_RUN === "1") {
  console.log(`Trockenlauf.\n${HF_URL}${q}\n${GITHUB_URL}${q}`);
  process.exit(0);
}

async function holen(url: string, kopf: Record<string, string> = {}): Promise<unknown> {
  const r = await fetch(url, { headers: { accept: "application/json", ...kopf }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

// tsx lädt dieses Projekt als CommonJS; Top-Level-await verhindert bereits den Trockenlauf.
async function main() {
  const jetzt = new Date().toISOString();
  const token = process.env.GITHUB_TOKEN;
  const [hf, gh] = await Promise.all([holen(`${HF_URL}${q}`), holen(`${GITHUB_URL}${q}`, token ? { authorization: `Bearer ${token}` } : {})]);
  const datei = `docs/decisions/${issue}-research.md`;
  const treffer = [...githubTreffer(gh, jetzt), ...huggingfaceTreffer(hf, jetzt)];
  writeFileSync(datei, entscheidungsdatei(issue, frage, treffer, jetzt));
  console.log(`Geschrieben: ${datei}`);
  // shortcut: Empfehlung ist vorläufig „anpassen“ (bauen/nicht bauen trägt die Rolle nach, siehe Entscheidungsdatei); ausbauen, sobald das Skript Lizenz und Alter selbst wertet.
  const ergebnis = rollenErgebnis("research", issue, { zusammenfassung: `${treffer.length} Treffer für „${frage}“ (GitHub, Hugging Face); Empfehlung vorläufig.`, naechster_schritt: `${datei} lesen, Lizenz prüfen, Empfehlung festlegen.`, quellen: [`${GITHUB_URL}${q}`, `${HF_URL}${q}`] }, {
    treffer: treffer.map(({ quelle, name, url, lizenz, sterne, datum }) => ({ quelle, name, url, lizenz, sterne, datum })),
    empfehlung: "anpassen",
  });
  console.log(`Ergebnis: ${schreibeErgebnis("research", ergebnis)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
