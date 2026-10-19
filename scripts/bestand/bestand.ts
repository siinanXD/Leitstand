/**
 * Bestandsabgleich 1/3 (SIN-858): liest lesend Gedächtnis (index.md), Repo-Dateien, Linear (alle Zustände) und PRs
 * und schreibt je Anfrage eine JSON-Datei nach BESTAND_AUSGABE (Standard `bestand-ausgabe/`). Schreibt weder in Repos noch in Linear.
 * Aufruf: `npx tsx scripts/bestand/bestand.ts <produkt> <bereich> <feature> [begriff …]`
 * Umgebung: GH_TOKEN (PRs, Vault), LINEAR_API_KEY. DRY_RUN=1: kein Netz, nur das lokale Repo; die übrigen Quellen stehen als Quellfehler im Bericht.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { holeSeiten, sammle, type Gelesen, type Lader } from "../../src/lib/bestand/bestand";
import { VAULT_REPO } from "../../src/lib/gedaechtnis/gedaechtnis";
import { ladeProjektIssues } from "../../src/lib/loop/projekt-issues";
import { PROJEKT } from "../../src/lib/loop/auswahl";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const REPO = "siinanXD/Leitstand";
const AUSGABE = env.BESTAND_AUSGABE ?? "bestand-ausgabe";
const PRO_SEITE = 100;

const gh = async <T>(pfad: string): Promise<T> => {
  if (DRY) throw new Error("Trockenlauf, kein Netz");
  if (!env.GH_TOKEN) throw new Error("GH_TOKEN fehlt");
  const res = await fetch(`https://api.github.com${pfad}`, { headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } });
  if (!res.ok) throw new Error(`GitHub ${pfad.split("?")[0]}: ${res.status}`);
  return (await res.json()) as T;
};

async function linear<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  if (DRY) throw new Error("Trockenlauf, kein Netz");
  if (!env.LINEAR_API_KEY) throw new Error("LINEAR_API_KEY fehlt");
  const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { "Content-Type": "application/json", Authorization: env.LINEAR_API_KEY }, body: JSON.stringify({ query, variables }) });
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (!res.ok || json.errors) throw new Error(`Linear: ${res.status}`);
  return json.data as T;
}

const lader: Lader = {
  async gedaechtnis(): Promise<Gelesen> {
    const [datei, commit] = await Promise.all([
      gh<{ content: string; html_url: string }>(`/repos/${VAULT_REPO}/contents/index.md`),
      gh<{ sha: string }>(`/repos/${VAULT_REPO}/commits/HEAD`),
    ]);
    // Nur die Katalogzeilen (Titel + Beschreibung), keine Notizinhalte.
    const zeilen = Buffer.from(datei.content, "base64").toString("utf8").split("\n").filter((z) => z.startsWith("- [["));
    return { ref: VAULT_REPO, sha: commit.sha, eintraege: zeilen.map((titel) => ({ titel, url: datei.html_url })) };
  },
  async code(): Promise<Gelesen> {
    const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8" }).trim();
    const dateien = git("ls-files", "src", "scripts", "docs/decisions", "tests").split("\n").filter(Boolean);
    return { ref: REPO, sha: git("rev-parse", "HEAD"), eintraege: dateien.map((titel) => ({ titel, url: `https://github.com/${REPO}/blob/HEAD/${titel}` })) };
  },
  async linear(): Promise<Gelesen> {
    const knoten = await ladeProjektIssues(linear, PROJEKT, ["backlog", "unstarted", "started", "completed", "canceled"]);
    return { ref: `Linear-Projekt ${PROJEKT}`, sha: null, eintraege: knoten.map((k) => ({ titel: `${k.identifier} ${k.title}`, url: k.url, zustand: k.state.type })) };
  },
  async prs(): Promise<Gelesen> {
    const prs = await holeSeiten((seite) => gh<{ number: number; title: string; html_url: string; state: string; merged_at: string | null; head: { sha: string } }[]>(`/repos/${REPO}/pulls?state=all&per_page=${PRO_SEITE}&page=${seite}`), PRO_SEITE, 100);
    // Ein PR hat keinen gemeinsamen Stand: der Head steht im Titel-Zusatz, die Quelle selbst hat keine SHA.
    return { ref: REPO, sha: null, eintraege: prs.map((p) => ({ titel: `#${p.number} ${p.title} (Head ${p.head.sha.slice(0, 7)})`, url: p.html_url, zustand: p.merged_at ? "merged" : p.state })) };
  },
};

const [produkt, bereich, feature, ...begriffe] = process.argv.slice(2);
if (!produkt || !bereich || !feature) {
  console.error("Aufruf: bestand.ts <produkt> <bereich> <feature> [begriff …]");
  process.exit(2);
}
// Kein Top-Level-await: tsx läuft im Repo als CJS.
async function main() {
  const bericht = await sammle({ produkt, bereich, feature, ...(begriffe.length ? { begriffe } : {}) }, lader);
  mkdirSync(AUSGABE, { recursive: true });
  const datei = join(AUSGABE, `${produkt}-${bereich}.json`);
  writeFileSync(datei, `${JSON.stringify(bericht, null, 2)}\n`);
  console.log(`${datei}: ${bericht.vorhandene_bausteine.length} Bausteine, ${bericht.offene_arbeit.length} offen, ${bericht.quellfehler.length} Quellfehler`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
