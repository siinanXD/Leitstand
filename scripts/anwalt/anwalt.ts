/**
 * Anwalt-Agent (SIN-552). Aufruf aus anwalt.yml (.github/workflows/anwalt.yml):
 *
 *   npx tsx scripts/anwalt/anwalt.ts <Basis-Ref>   PR prüfen: Diff gegen Basis-Ref, schreibt Kommentar nach anwalt-kommentar.md
 *   npx tsx scripts/anwalt/anwalt.ts --avv         monatlicher Abgleich docs/recht/AVV.md gegen package.json, Workflows, Skripte
 *
 * Ausgabe: Ampel im Log. Exit-Code 1 bei Rot (PR) bzw. bei Lücken (AVV); der Workflow setzt dann `needs-human` bzw. ein `sinan`-Issue.
 * Keine Rechtsberatung. Kein Netz.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { avvLuecken, betrifftRecht, brauchtMensch, kommentar, pruefeDiff } from "../../src/lib/anwalt/anwalt";

function pr(basis: string) {
  const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 50_000_000 });
  const geprueft = git("diff", "--name-only", `${basis}...HEAD`).split("\n").filter((p) => p && betrifftRecht(p));
  const funde = geprueft.length ? pruefeDiff(git("diff", "--unified=0", `${basis}...HEAD`, "--", ...geprueft)) : [];
  writeFileSync("anwalt-kommentar.md", kommentar(funde, geprueft));
  console.log(`Anwalt-Agent: ${funde.length} Funde in ${geprueft.length} Dateien`);
  process.exit(brauchtMensch(funde) ? 1 : 0);
}

function avv() {
  const quellen = ["package.json", ...readdirSync(".github/workflows").map((n) => `.github/workflows/${n}`), ...(readdirSync("scripts", { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => `${e.parentPath}/${e.name}`))].map((name) => ({ name, text: readFileSync(name, "utf8") }));
  const luecken = avvLuecken(readFileSync("docs/recht/AVV.md", "utf8"), quellen);
  for (const l of luecken) console.log(`${l.dienst}: ${l.grund === "fehlt" ? "Zeile fehlt" : "AVV-Link fehlt"}${l.benutzt ? " (wird benutzt)" : ""}`);
  console.log(luecken.length ? `${luecken.length} Lücken in docs/recht/AVV.md` : "AVV-Liste vollständig");
  process.exit(luecken.length ? 1 : 0);
}

const arg = process.argv[2];
if (arg === "--avv") avv();
else if (arg) pr(arg);
else {
  console.error("Aufruf: anwalt.ts <Basis-Ref> | --avv");
  process.exit(2);
}
