/** SIN-1053: Abo-only-Prüfer. Aufruf: pruefer.ts <PR> <Basis-SHA> <Head-SHA>.
 * Liest den aktuellen Linear-Auftrag und native Codex-Reviews; ruft keine Modell-API auf.
 * DRY_RUN=1: keine Anstöße, kein produktiver Kommentar/Stand und keine Ledger-Schreibzugriffe.
 */
import { appendFileSync, rmSync, writeFileSync } from "node:fs";
import { lesePrDiff } from "../../src/lib/pruefer/git";
import { bewerte, hatRisiko, kommentar, reviewerZeile, type Ergebnis } from "../../src/lib/pruefer/pruefer";
import { codexAntwortHash } from "../../src/lib/pruefer/codex";
import { pruefeCodexAbo } from "../../src/lib/pruefer/codex-ablauf";
import { ladeAuftrag, standMarker } from "../loop/beleg-stand.mjs";
import { fordereCodexAn, github, ladeCodexLage, pruefeAktuellenPr, REPOS } from "./codex";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const [nummer, basis, head] = process.argv.slice(2);
const repo = env.GH_REPO ?? env.GITHUB_REPOSITORY ?? "siinanXD/Leitstand";
if (!/^[1-9][0-9]*$/.test(nummer ?? "") || !/^[a-f0-9]{40}$/.test(basis ?? "") || !/^[a-f0-9]{40}$/.test(head ?? "") || !REPOS.includes(repo)) {
  console.error("Aufruf: pruefer.ts <PR> <Basis-SHA> <Head-SHA>, freigegebenes GH_REPO nötig");
  process.exit(2);
}

function schreibeErgebnis(ergebnis: Ergebnis, hash: string, wartend: boolean, gelesen = "") {
  const hinweis = DRY ? "**Trockenlauf: keine unabhängige Prüfung oder Live-Abnahme.**\n\n" : "";
  const text = kommentar(ergebnis, "Codex nativ", null).replace(reviewerZeile("codex"), "Reviewer: Codex (Abo)");
  const marker = !DRY && !wartend && ergebnis.bestanden ? standMarker(head, hash) : "";
  writeFileSync(DRY ? "pruefer-trockenlauf.md" : "pruefer-kommentar.md", `${hinweis}${text}\n\n${marker}\n${gelesen ? `<!-- codex-antworten:v1 ${gelesen} -->` : ""}\nGeprüfter Commit: \`${head}\`\nGeprüfte Basis: \`${basis}\``);
  writeFileSync("pruefer-status.txt", wartend || DRY ? "wartend\n" : ergebnis.bestanden ? "bestanden\n" : "offen\n");
  if (hatRisiko(ergebnis)) writeFileSync("pruefer-hoch.txt", "hoch\n");
  if (wartend && env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, "wartend=true\n");
}

async function protokolliere(bestanden: boolean, wartend: boolean) {
  if (DRY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events`, {
    method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ project: repo.endsWith("Content-Agent-Lernapp") ? "lernapp" : "leitstand", agent: "pruefer", step: "pruefer", status: wartend ? "uebersprungen" : bestanden ? "ok" : "fehler", issue: null, pr: Number(nummer), grund: bestanden ? null : wartend ? "codex_abo: unabhängiger Beleg ausstehend" : "codex_abo: Prüfung nicht bestanden", payload: { quelle: "codex", bestanden, wartend, kosten_eur_usd: null } }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) console.log(`::warning::loop_events: HTTP ${res.status}`);
}

function trockenlauf() {
  const pr = github<{ title: string; body: string }>(`repos/${repo}/pulls/${nummer}`);
  const { dateien } = lesePrDiff(basis, head);
  const ergebnis = bewerte({ bestanden: false, funde: [] }, dateien, false);
  schreibeErgebnis(ergebnis, "", true);
  console.log(`[trocken] ${pr.title}: ${dateien.length} Dateien, kein Modellaufruf oder nativer Anstoß`);
}

async function main() {
  for (const datei of ["pruefer-kommentar.md", "pruefer-trockenlauf.md", "pruefer-status.txt", "pruefer-hoch.txt"]) rmSync(datei, { force: true });
  if (DRY) return trockenlauf();
  const pr = pruefeAktuellenPr(repo, nummer, head, basis);
  const issue = await ladeAuftrag(pr.title, env.LINEAR_API_KEY);
  const stand = { head, basis, auftrag: issue.hash };
  const jetzt = new Date();
  const lage = ladeCodexLage(repo, nummer, jetzt);
  const ausgang = await pruefeCodexAbo({ ...lage, stand, jetzt, deckel: Number(env.CODEX_PRUEFER_MAX_TAG ?? "15"), trocken: false }, async text => {
    pruefeAktuellenPr(repo, nummer, head, basis);
    const aktuell = await ladeAuftrag(pr.title, env.LINEAR_API_KEY);
    if (aktuell.hash !== stand.auftrag) throw new Error("Auftrag geändert, kein nativer Anstoß");
    await fordereCodexAn(repo, nummer, text);
  });
  const wartend = ausgang.status !== "fertig";
  const { dateien } = lesePrDiff(basis, head);
  const ergebnis = ausgang.status === "fertig" ? bewerte(ausgang.ergebnis, dateien, false, issue.body)
    : { bestanden: false, funde: [{ datei: "(Codex)", zeile: 0, schwere: "mittel" as const, art: "nachweis" as const, text: ausgang.grund }] };
  // Vor lokalem Freigabeartefakt nochmals Auftrag/Ziel prüfen; Workflow validiert zusätzlich direkt vor Veröffentlichung.
  pruefeAktuellenPr(repo, nummer, head, basis);
  const aktuell = await ladeAuftrag(pr.title, env.LINEAR_API_KEY);
  if (aktuell.hash !== stand.auftrag) throw new Error("Auftrag während Prüfung geändert; Ergebnis ungültig");
  schreibeErgebnis(ergebnis, stand.auftrag, wartend, codexAntwortHash(lage.reviews));
  await protokolliere(ergebnis.bestanden, wartend);
  console.log(`Prüfer: ${wartend ? "wartend" : ergebnis.bestanden ? "bestanden" : "nicht bestanden"}; Quelle Codex (Abo)`);
  if (!wartend && !ergebnis.bestanden) process.exitCode = 1;
}

main().catch(() => {
  // Fremde Dienstantworten können Auftragstexte/Tokens enthalten; keine Rohantworten veröffentlichen.
  console.error("::error::Nativer Prüfer abgebrochen; kein gültiger Freigabebeleg erzeugt");
  process.exitCode = 2;
});
