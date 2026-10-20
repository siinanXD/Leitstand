/** Lesender Feature-Bestand (SIN-858). DRY_RUN=1 blockiert Netz; BESTAND_FIXTURE liefert nur Testdaten. */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { holeSeiten, passt, sammle, stichwoerter, type Fund, type Gelesen, type Lader } from "../../src/lib/bestand/bestand";
import { VAULT_REPO } from "../../src/lib/gedaechtnis/gedaechtnis";
import { PROJEKT } from "../../src/lib/loop/auswahl";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const REPO = "siinanXD/Leitstand";
const [produkt, bereich, feature, ...begriffe] = process.argv.slice(2);
if (produkt !== "leitstand" || !bereich || !feature || !/^[a-z0-9-]+$/.test(bereich)) {
  console.error("Aufruf: bestand.ts leitstand <bereich[a-z0-9-]> <feature> [begriff …]");
  process.exit(2);
}
const wörter = (begriffe.length ? begriffe : stichwoerter(feature)).map((w) => w.toLowerCase());
const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 10_000_000 }).trim();
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
async function gh<T>(pfad: string): Promise<T> {
  if (DRY || !env.GH_TOKEN) throw new Error("GitHub nicht verfügbar");
  const res = await fetch(`https://api.github.com${pfad}`, { headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`GitHub: ${res.status}`);
  return await res.json() as T;
}
async function notiz(pfad: string, sha: string): Promise<Fund> {
  const datei = await gh<{ content: string }>(`/repos/${VAULT_REPO}/contents/${encodeURIComponent(pfad)}?ref=${sha}`);
  const inhalt = Buffer.from(datei.content, "base64").toString("utf8");
  return { titel: pfad, url: `https://github.com/${VAULT_REPO}/blob/${sha}/${encodeURI(pfad)}`, sha, inhalt, inhalt_sha256: hash(inhalt) };
}
const lader: Lader = {
  async gedaechtnis() {
    const { sha } = await gh<{ sha: string }>(`/repos/${VAULT_REPO}/commits/HEAD`);
    const [index, produktnotiz] = await Promise.all([notiz("index.md", sha), notiz("Produkte/Leitstand.md", sha)]);
    const pfade = new Set<string>();
    for (const zeile of `${index.inhalt}\n${produktnotiz.inhalt}`.split("\n").filter((z) => passt({ titel: z, url: "" }, wörter))) {
      for (const m of zeile.matchAll(/\[\[([^\]|#]+)(?:[^\]]*)\]\]/g)) {
        const pfad = `${m[1].replace(/\.md$/, "")}.md`;
        if (!pfad.includes("..") && !pfad.startsWith("/")) pfade.add(pfad);
      }
    }
    const eintraege = await Promise.all([...pfade].filter((pfad) => pfad !== "Produkte/Leitstand.md" && pfad !== "index.md").map((pfad) => notiz(pfad, sha)));
    // Index liefert die Auswahl; nur passende Notizen und dessen Hash verlassen den Leser.
    return { ref: VAULT_REPO, sha, eintraege: [{ ...index, inhalt: index.inhalt!.split("\n").filter((z) => passt({ titel: z, url: "" }, wörter)).join("\n") }, produktnotiz, ...eintraege] };
  },
  async code() {
    const sha = git("rev-parse", "HEAD");
    const pfade = ["src", "scripts", "tests", "e2e", "docs/decisions", ".github/workflows"];
    // Git sucht im gepinnten Baum; nur Treffer werden einzeln geladen und gehasht.
    const suche = spawnSync("git", ["grep", "-I", "-i", "-l", "-z", "-F", ...wörter.flatMap((w) => ["-e", w]), sha, "--", ...pfade], { encoding: "utf8", maxBuffer: 10_000_000 });
    if (suche.error || (suche.status !== 0 && suche.status !== 1)) throw new Error("Code-Suche fehlgeschlagen");
    const inhaltTreffer = new Set(suche.stdout.split("\0").filter(Boolean).map((p) => p.slice(sha.length + 1)));
    const dateien = git("ls-tree", "-r", "--name-only", "-z", sha, ...pfade).split("\0").filter(Boolean)
      .filter((p) => inhaltTreffer.has(p) || passt({ titel: p, url: "" }, wörter));
    const eintraege = dateien.flatMap((titel): Fund[] => {
      if (!/\.(tsx?|jsx?|mjs|cjs|mts|cts|sh|py|md|json|ya?ml)$/.test(titel)) return [];
      const inhalt = git("show", `${sha}:${titel}`);
      const f = { titel, url: `https://github.com/${REPO}/blob/${sha}/${titel}`, sha, inhalt, inhalt_sha256: hash(inhalt) };
      return passt(f, wörter) ? [f] : [];
    });
    return { ref: REPO, sha, eintraege };
  },
  async linear() {
    if (DRY || !env.LINEAR_API_KEY) throw new Error("Linear nicht verfügbar");
    const eintraege: Fund[] = [];
    let after: string | null = null;
    const gesehen = new Set<string>();
    for (;;) {
      const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { "Content-Type": "application/json", Authorization: env.LINEAR_API_KEY }, body: JSON.stringify({ query: `query($filter: IssueFilter!, $after: String) { issues(first: 25, after: $after, filter: $filter) { nodes { identifier title description url state { type } } pageInfo { hasNextPage endCursor } } }`, variables: { after, filter: { project: { name: { eq: PROJEKT } }, or: wörter.flatMap((wort) => [{ title: { containsIgnoreCase: wort } }, { description: { containsIgnoreCase: wort } }]) } } }) });
      const json = await res.json() as { errors?: unknown; data?: { issues: { nodes: { identifier: string; title: string; description: string | null; url: string; state: { type: string } }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } };
      if (!res.ok || json.errors || !json.data) throw new Error("Linear-Abfrage fehlgeschlagen");
      const seite = json.data.issues;
      eintraege.push(...seite.nodes.map((k) => ({ titel: `${k.identifier} ${k.title}`, url: k.url, zustand: k.state.type, inhalt: k.description ?? "" })));
      if (!seite.pageInfo.hasNextPage) return { ref: `Linear-Projekt ${PROJEKT}`, sha: null, eintraege };
      after = seite.pageInfo.endCursor;
      if (!after || gesehen.has(after)) throw new Error("Linear-Cursor ungültig");
      gesehen.add(after);
    }
  },
  async prs() {
    const nummern = new Set<number>();
    for (const wort of wörter) {
      const treffer = await holeSeiten(async (seite) => {
        const q = encodeURIComponent(`repo:${REPO} is:pr ${wort} in:title,body`);
        const d = await gh<{ incomplete_results: boolean; total_count: number; items: { number: number }[] }>(`/search/issues?q=${q}&per_page=100&page=${seite}`);
        if (d.incomplete_results || d.total_count > 1000) throw new Error("GitHub-Suche unvollständig");
        return d.items;
      }, 100, 11);
      treffer.forEach((p) => nummern.add(p.number));
    }
    const eintraege = await Promise.all([...nummern].map(async (n) => {
      const p = await gh<{ title: string; body: string | null; html_url: string; state: string; merged_at: string | null; head: { sha: string } }>(`/repos/${REPO}/pulls/${n}`);
      return { titel: `#${n} ${p.title}`, url: p.html_url, sha: p.head.sha, zustand: p.merged_at ? "merged" : p.state, inhalt: p.body ?? "" };
    }));
    return { ref: REPO, sha: null, eintraege };
  },
};
async function main() {
  // Fixtures laufen durch denselben CLI-/JSON-Vertrag; nie als Live-Ergebnis kennzeichnen.
  if (env.BESTAND_FIXTURE) {
    if (!DRY) throw new Error("Fixture nur im Trockenlauf erlaubt");
    const fixture = JSON.parse(readFileSync(env.BESTAND_FIXTURE, "utf8")) as Record<keyof Lader, Gelesen>;
    for (const art of ["gedaechtnis", "linear", "prs"] as const) lader[art] = async () => fixture[art];
  }
  if (env.BESTAND_CONNECTOR_INPUT) {
    if (DRY || env.BESTAND_FIXTURE) throw new Error("Connector-Snapshot und Fixture dürfen nicht vermischt werden");
    const d = JSON.parse(readFileSync(env.BESTAND_CONNECTOR_INPUT, "utf8")) as {
      memory: { repo: string; path: string; sha: string; content: string; display_url: string };
      linear: { id: string; title: string; description: string; url: string; statusType: string; updatedAt: string };
      pr: { repo: string; number: number; head: string; url: string };
    };
    lader.gedaechtnis = async () => ({ ref: `${d.memory.repo} (Connector-Snapshot, Blob-SHA)`, sha: null, eintraege: [{ titel: d.memory.path, url: d.memory.display_url, sha: d.memory.sha, inhalt: d.memory.content, inhalt_sha256: hash(d.memory.content) }] });
    lader.linear = async () => ({ ref: `Connector-Snapshot ${d.linear.id}, updatedAt=${d.linear.updatedAt}`, sha: null, eintraege: [{ titel: `${d.linear.id} ${d.linear.title}`, url: d.linear.url, zustand: d.linear.statusType, inhalt: d.linear.description }] });
    lader.prs = async () => ({ ref: `${d.pr.repo} (Connector-Snapshot, gezielt PR #${d.pr.number})`, sha: null, eintraege: [{ titel: `#${d.pr.number} Bestandsabgleich SIN-858`, url: d.pr.url, sha: d.pr.head, zustand: "open" }] });
  }
  const bericht = await sammle({ produkt, bereich, feature, begriffe: wörter }, lader);
  const ausgabe = env.BESTAND_AUSGABE ?? "docs/bestand";
  mkdirSync(ausgabe, { recursive: true });
  const datei = join(ausgabe, `${produkt}-${bereich}.json`);
  writeFileSync(datei, `${JSON.stringify(bericht, null, 2)}\n`, { mode: 0o600 });
  console.log(`${DRY ? "Trockenlauf" : env.BESTAND_CONNECTOR_INPUT ? "Connector-Snapshot + lokales Git" : "Lesendes Inventar"}: ${datei}; ${bericht.quellfehler.length} Quellfehler`);
  if (!DRY && bericht.quellfehler.length) process.exitCode = 1;
}
main().catch(() => { console.error("Bestandsabgleich fehlgeschlagen (keine Rohfehler gespeichert)"); process.exitCode = 1; });
