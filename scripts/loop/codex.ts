// SIN-1052: bestehende Loop-CLI in abgegrenzte Module zerlegt; Policy und Vertrauensgrenzen bleiben erhalten.
import { type ProjektKnoten } from "../../src/lib/loop/projekt-issues";
import { fehlergrund } from "../../src/lib/loop/fehlergrund";
import { type LinearIssue, CODEX_NAME, LABEL, LABEL_CODEX, codexRolle, codexStarts, prGehoertZu, codexAuftrag } from "../../src/lib/loop/auswahl";
import { linear, gh, DRY, ereignis } from "./netz";
import { setzeStatus, kommentar } from "./linear-netz";

// Null means the project-wide occupancy could not be read: no new Codex assignment.
export const codexLage = { bestand: null as LinearIssue[] | null };

/** Linear-Nutzer „Codex“ (Codex for Linear). Fehlt er, ist die App im Workspace nicht installiert. */
async function codexNutzer(): Promise<string> {
  const d = await linear<{ users: { nodes: { id: string; name: string }[] } }>(`query { users(first: 250) { nodes { id name } } }`);
  const u = d.users.nodes.find((x) => x.name.toLowerCase() === CODEX_NAME.toLowerCase());
  if (!u) throw new Error(`Linear-Nutzer „${CODEX_NAME}“ nicht gefunden: Codex for Linear im Workspace installieren`);
  return u.id;
}

/**
 * Codex-Spur (SIN-936): Issues mit Label `codex` bekommen Codex als Delegate statt eines Claude-Laufs (kein GitHub-Spiegel, kein Platz).
 * Ein Timeout erlaubt ohne bestätigtes Agentenende keine Übergabe an einen zweiten Worker (SIN-1052).
 * Gibt die Issues so zurück, wie sie danach in Linear stehen, damit die Claude-Auswahl sie richtig sieht.
 */
export async function codexSpur(repo: string, issues: LinearIssue[], nodes: ProjektKnoten[], prs: { title: string; head: { ref: string } }[], projekt: string, gespiegelt: Set<string>): Promise<LinearIssue[]> {
  const jetzt = new Date();
  const neu = new Map(issues.map((i) => [i.identifier, i]));
  const refs = issues.some((i) => i.delegate) ? await gh<{ ref: string }[]>(`/repos/${repo}/git/matching-refs/heads/codex/`) : [];
  const pruefe = [...refs.map((r) => ({ titel: "", branch: r.ref.replace("refs/heads/", "") })), ...prs.map((p) => ({ titel: p.title, branch: p.head.ref }))];
  // Alte allgemeine Codex-Aufträge gehen ungestartet an den Hauptworker. Gesperrte/übergebene Aufträge bleiben unberührt.
  for (const i of issues.filter(i => i.stateType === "unstarted" && !i.delegate && i.labels.some(l => l.toLowerCase() === LABEL_CODEX)
    && !codexRolle(i.description) && !i.labels.some(l => ["needs-human", "sinan", "entscheidung", "kriterien-unklar", "design", "lauf"].includes(l.toLowerCase())))) {
    await anClaude(i, "Kein expliziter Codex-Rollenauftrag: allgemeine Umsetzung geht an Claude (SIN-1052).", nodes, neu);
  }
  const start = codexStarts([...neu.values()].filter(i => !gespiegelt.has(i.identifier) && !pruefe.some(p => prGehoertZu(p, i))), codexLage.bestand);
  let codexId: string | null = null;
  if (start.length && !DRY) {
    try { codexId = await codexNutzer(); }
    catch (e) {
      // Nur der belegte Fall „App fehlt“ ist ein sicherer Rückfall vor dem Start. Netz-/Lesefehler bleiben unbekannt.
      if ((e as Error).message.startsWith("Linear-Nutzer")) {
        for (const i of start) await anClaude(i, "Codex-App vor der Übergabe nicht verfügbar: Claude übernimmt (SIN-1052).", nodes, neu);
      }
      await ereignis("dispatch", "fehler", { projekt, grund: fehlergrund(`codex_nutzer: ${(e as Error).message}`) });
    }
  }
  for (const i of start) {
    if (DRY) { console.log(`[trocken] würde an Codex geben: ${i.identifier} (${codexRolle(i.description)})`); continue; }
    if (!codexId) break;
    const team = nodes.find(n => n.id === i.id)!.team.id;
    // Vor dem Start belegen, auch wenn danach die Startbestätigung verloren geht.
    codexLage.bestand?.push({ ...i, delegate: CODEX_NAME });
    try {
      const rolle = codexRolle(i.description)!;
      const beschreibung = codexAuftrag(i.description, rolle);
      const vorbereitet = await linear<{ issueUpdate: { success: boolean } }>(`mutation($id: String!, $beschreibung: String!) { issueUpdate(id: $id, input: { description: $beschreibung }) { success } }`, { id: i.id, beschreibung });
      if (!vorbereitet.issueUpdate.success) throw new Error("Codex-Rollenauftrag nicht gespeichert");
      const delegiert = await linear<{ issueUpdate: { success: boolean } }>(`mutation($id: String!, $d: String!) { issueUpdate(id: $id, input: { delegateId: $d }) { success } }`, { id: i.id, d: codexId });
      if (!delegiert.issueUpdate.success) throw new Error("Codex-Delegation nicht bestätigt");
      // Sofort lokal sperren; auch ein Fehler beim folgenden Status-/Kommentar-Schritt darf keinen Claude-Start freigeben.
      neu.set(i.identifier, { ...i, delegate: CODEX_NAME, stateType: "started", startedAt: jetzt.toISOString(), description: beschreibung });
      await setzeStatus(i.id, team, "In Progress");
      await kommentar(i.id, `An Codex übergeben, Rolle ${rolle} (SIN-1052). Ein fehlender Branch allein löst keine zweite Umsetzung aus.`);
      await ereignis("dispatch", "ok", { projekt, issue: i.identifier, grund: `codex_zugewiesen: ${rolle}` });
    } catch (e) {
      // Unklarer Start bleibt gesperrt; Delegate entfernen beendet keine Agentensitzung nachweisbar.
      neu.set(i.identifier, { ...i, delegate: CODEX_NAME });
      await ereignis("dispatch", "fehler", { projekt, issue: i.identifier, grund: fehlergrund(`codex_zuweisung_unklar: ${(e as Error).message}`) });
    }
  }
  return issues.map((i) => neu.get(i.identifier)!);
}

async function anClaude(i: LinearIssue, grund: string, nodes: ProjektKnoten[], neu: Map<string, LinearIssue>) {
  if (i.delegate || i.stateType !== "unstarted") return;
  if (DRY) { console.log(`[trocken] ${i.identifier}: ${grund}`); return; }
  const team = nodes.find(n => n.id === i.id)!.team.id;
  const l = await linear<{ team: { labels: { nodes: { id: string; name: string }[] } } }>(`query($t: String!) { team(id: $t) { labels(first: 250) { nodes { id name } } } }`, { t: team });
  const id = (name: string) => l.team.labels.nodes.find(x => x.name.toLowerCase() === name)?.id;
  const claude = id(LABEL), codex = id(LABEL_CODEX);
  if (!claude || !codex) throw new Error("Claude-/Codex-Label fehlt");
  const d = await linear<{ issueUpdate: { success: boolean } }>(`mutation($id: String!, $a: [String!], $r: [String!]) { issueUpdate(id: $id, input: { addedLabelIds: $a, removedLabelIds: $r }) { success } }`, { id: i.id, a: [claude], r: [codex] });
  if (!d.issueUpdate.success) throw new Error("Claude-Übergabe nicht bestätigt");
  neu.set(i.identifier, { ...i, labels: [...i.labels.filter(x => x.toLowerCase() !== LABEL_CODEX), LABEL] });
  await kommentar(i.id, grund);
}
