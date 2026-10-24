/**
 * SIN-1063: Sauberkeits-Tor für neuen Code. Aufruf: `tsx scripts/sauberkeit/pruefen.ts <basis-ref>`.
 * Schritt `eslint-neu`: ESLint-Grenzen (Komplexität, Länge, Doku-Satz) als Fehler für geänderte Dateien.
 * Schritt `knip-neu`: neuer ungenutzter Export oder neue ungenutzte Datei ist rot; Altfunde bleiben Warnung.
 */
import { spawnSync } from "node:child_process";
import { hinzugefuegteZeilen, leseKnipFunde, neueFunde } from "../../src/lib/standard/sauberkeit";

const basis = process.argv[2];
if (!basis) {
  console.error("Aufruf: pruefen.ts <basis-ref>");
  process.exit(2);
}
const lauf = (befehl: string, args: string[], env: NodeJS.ProcessEnv = process.env) =>
  spawnSync(befehl, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env });
const git = (...a: string[]) => lauf("git", a).stdout;
const liste = (text: string) => text.split("\n").filter(Boolean);

const quellen = /\.(m?[jt]sx?)$/;
const geaendert = liste(git("diff", "--name-only", "--diff-filter=ACMR", `${basis}...HEAD`)).filter((d) => quellen.test(d));
const neu = liste(git("diff", "--name-only", "--diff-filter=A", `${basis}...HEAD`)).filter((d) => quellen.test(d));
let rot = false;

if (geaendert.length) {
  const eslint = lauf("npx", ["eslint", ...geaendert], { ...process.env, SAUBERKEIT_DATEIEN: geaendert.join("\n") });
  process.stdout.write(eslint.stdout);
  if (eslint.status !== 0) { console.error("eslint-neu: rot"); rot = true; } else console.log("eslint-neu: grün");
}

const knip = lauf("npx", ["knip", "--no-exit-code", "--reporter", "json"]);
const funde = neueFunde(leseKnipFunde(JSON.parse(knip.stdout)), neu, hinzugefuegteZeilen(git("diff", "-U0", "--diff-filter=ACMR", `${basis}...HEAD`)));
for (const f of funde) console.error(`knip-neu: ${f.datei}${f.zeile ? `:${f.zeile}` : ""} ${f.name} ist neu und ungenutzt`);
console.log(funde.length ? "knip-neu: rot" : "knip-neu: grün");
process.exit(rot || funde.length ? 1 : 0);
