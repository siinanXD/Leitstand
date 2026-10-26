/**
 * Testnutzer-Regel im Wächter (SIN-915): Netzteil. Logik rein in src/lib/waechter/testnutzer.ts.
 */
import { hatLogin, LOGIN_MUSTER, pruefeTestnutzer, type RepoDatei } from "../../src/lib/waechter/testnutzer";
import type { Projekt } from "../../src/lib/waechter/waechter";
import { DRY, gh, linear, log, neuesIssue } from "./netz";

/** Dateipfade aus GitHub; Code-Suche nur, solange die Pfade keinen Login zeigen (Codesuche: 10 Abfragen je Minute). */
async function ladeRepoDateien(repo: string): Promise<RepoDatei[]> {
  const baum = await gh<{ tree: { path: string }[] }>(`/repos/${repo}/git/trees/HEAD?recursive=1`);
  const dateien: RepoDatei[] = baum.tree.map((b) => ({ pfad: b.path }));
  for (const muster of LOGIN_MUSTER) {
    if (hatLogin(dateien)) break;
    const treffer = await gh<{ items: { path: string }[] }>(`/search/code?q=${encodeURIComponent(`"${muster}" repo:${repo}`)}&per_page=1`);
    dateien.push(...treffer.items.map((i) => ({ pfad: i.path, inhalt: muster })));
  }
  return dateien;
}

/** Hat das Projekt einen Login ohne Agent-Testnutzer, entsteht genau ein Todo-Issue mit Label `claude` (Entscheidung Sinan 26.10.). */
export async function pruefeTestnutzerRegel(projekt: Projekt, teamId: string, repo: string) {
  const dateien = await ladeRepoDateien(repo);
  let r = pruefeTestnutzer(projekt.name, dateien, []);
  if (r.issue) {
    // Titel in jedem Status (auch erledigt oder abgebrochen), damit das Issue nie doppelt entsteht.
    const d = await linear<{ issues: { nodes: { title: string }[] } }>(
      `query($p: ID!, $t: String!) { issues(first: 1, filter: { project: { id: { eq: $p } }, title: { eq: $t } }) { nodes { title } } }`,
      { p: projekt.id, t: r.issue.titel },
    );
    r = pruefeTestnutzer(projekt.name, dateien, d.issues.nodes.map((n) => n.title));
  }
  log(projekt.name, `Testnutzer-Regel: ${r.status}`);
  if (r.issue && !DRY) await neuesIssue(teamId, projekt.id, r.issue.titel, r.issue.beschreibung, ["claude"]);
}
