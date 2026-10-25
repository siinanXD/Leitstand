// SIN-1052: bestehende Loop-CLI in abgegrenzte Module zerlegt; Policy und Vertrauensgrenzen bleiben erhalten.
import { type ProjektKnoten, ladeProjektIssues } from "../../src/lib/loop/projekt-issues";
import { type LinearIssue, LABEL } from "../../src/lib/loop/auswahl";
import { kriterienPlan, LABEL_UNKLAR, UNKLAR_KOMMENTAR } from "../../src/lib/vorarbeiter/kriterien";
import { linear, DRY, ereignis } from "./netz";

export async function projektIssues(projekt: string): Promise<ProjektKnoten[]> {
  return ladeProjektIssues(linear, projekt);
}

export async function setzeStatus(issueId: string, teamId: string, name: string) {
  const d = await linear<{ team: { states: { nodes: { id: string; name: string }[] } } }>(
    `query($t: String!) { team(id: $t) { states { nodes { id name } } } }`,
    { t: teamId },
  );
  const s = d.team.states.nodes.find((x) => x.name === name);
  if (!s) throw new Error(`Linear-Status „${name}“ nicht gefunden`);
  if (DRY) return console.log(`[trocken] ${issueId} → ${name}`);
  await linear(`mutation($id: String!, $s: String!) { issueUpdate(id: $id, input: { stateId: $s }) { success } }`, { id: issueId, s: s.id });
}

export async function kommentar(issueId: string, body: string) {
  if (DRY) return console.log(`[trocken] Kommentar: ${body}`);
  await linear(`mutation($id: String!, $b: String!) { commentCreate(input: { issueId: $id, body: $b }) { success } }`, { id: issueId, b: body });
}

export async function issueNachKennung(identifier: string) {
  const d = await linear<{ issue: { id: string; team: { id: string } } | null }>(
    `query($id: String!) { issue(id: $id) { id team { id } } }`,
    { id: identifier },
  );
  return d.issue;
}

/** Backlog-Issue auf Todo mit Label `claude` setzen und das in Linear vermerken (SIN-417). */
export async function rueckeNach(i: LinearIssue, teamId: string) {
  const d = await linear<{ team: { states: { nodes: { id: string; name: string }[] }; labels: { nodes: { id: string; name: string }[] } } }>(
    `query($t: String!) { team(id: $t) { states { nodes { id name } } labels(first: 250) { nodes { id name } } } }`,
    { t: teamId },
  );
  const todo = d.team.states.nodes.find((x) => x.name === "Todo");
  const label = d.team.labels.nodes.find((x) => x.name.toLowerCase() === LABEL);
  if (!todo || !label) throw new Error("Status „Todo“ oder Label „claude“ in Linear nicht gefunden");
  if (DRY) return console.log(`[trocken] würde nachrücken: ${i.identifier}`);
  await linear(`mutation($id: String!, $s: String!, $l: [String!]) { issueUpdate(id: $id, input: { stateId: $s, addedLabelIds: $l }) { success } }`, {
    id: i.id,
    s: todo.id,
    l: [label.id],
  });
  await kommentar(i.id, "Automatisch aus dem Backlog nachgerückt: keine anderen Leitstand-Issues mehr in der Schlange (SIN-417). Mit Label `design`, `sinan` oder `needs-human` rückt ein Issue nie nach.");
  console.log(`Nachgerückt: ${i.identifier}`);
}

/** Ein `sinan`-Issue in Linear, nur einmal je Titel (offene Issues gleichen Titels zählen). */
export async function sinanIssue(teamId: string, title: string, description: string) {
  if (DRY) return console.log(`[trocken] sinan-Issue: ${title}`);
  const d = await linear<{ issues: { nodes: { id: string }[] }; team: { labels: { nodes: { id: string; name: string }[] } } }>(
    `query($t: String!, $title: String!) {
      issues(first: 1, filter: { title: { eq: $title }, state: { type: { nin: ["completed", "canceled"] } } }) { nodes { id } }
      team(id: $t) { labels(first: 250) { nodes { id name } } }
    }`,
    { t: teamId, title },
  );
  if (d.issues.nodes.length) return;
  const label = d.team.labels.nodes.find((l) => l.name.toLowerCase() === "sinan");
  await linear(`mutation($i: IssueCreateInput!) { issueCreate(input: $i) { success } }`, {
    i: { teamId, title, description, labelIds: label ? [label.id] : [] },
  });
}

/** Issue mit Text und bisherigen Kommentaren, für den Haken-Abgleich (SIN-754). */
export async function issueMitHaken(identifier: string) {
  const d = await linear<{ issue: { id: string; description: string | null; team: { id: string }; comments: { nodes: { body: string }[] } } | null }>(
    `query($id: String!) { issue(id: $id) { id description team { id } comments(first: 100) { nodes { body } } } }`,
    { id: identifier },
  );
  return d.issue;
}

/**
 * Kriterien-Check beim Anlegen (SIN-929): vor der Auswahl Live-Haken mit `[nach Aktivierung]` und Testnamen-Block
 * in die Issue-Beschreibung schreiben; ohne prüfbaren Haken Label `kriterien-unklar` setzen und einmal kommentieren.
 * Gibt die Issues mit aktualisiertem Text und Label zurück, damit `waehle` sie nicht startet.
 */
export async function kriterienAnwenden(issues: LinearIssue[], nodes: ProjektKnoten[], projekt: string): Promise<LinearIssue[]> {
  const plan = kriterienPlan(issues);
  if (!plan.length) return issues;
  const neu = new Map(issues.map((i) => [i.identifier, i]));
  for (const a of plan) {
    const i = neu.get(a.identifier)!;
    const team = nodes.find((n) => n.id === i.id)!.team.id;
    console.log(`${a.identifier}: Kriterien-Check${a.beschreibung !== null ? ", Text ergänzt" : ""}${a.label ? `, ${LABEL_UNKLAR}` : ""}`);
    if (DRY) continue;
    if (a.beschreibung !== null) {
      await linear(`mutation($id: String!, $d: String!) { issueUpdate(id: $id, input: { description: $d }) { success } }`, { id: i.id, d: a.beschreibung });
      neu.set(a.identifier, { ...i, description: a.beschreibung });
    }
    if (a.label) {
      await labelSetzen(i.id, team, LABEL_UNKLAR, true);
      neu.set(a.identifier, { ...neu.get(a.identifier)!, labels: [...i.labels, LABEL_UNKLAR] });
      await kommentar(i.id, UNKLAR_KOMMENTAR);
      await ereignis("dispatch", "uebersprungen", { projekt, issue: a.identifier, grund: "kriterien-unklar: kein prüfbarer Fertig-Haken" });
    }
  }
  return issues.map((i) => neu.get(i.identifier)!);
}

/** Label am Linear-Issue setzen (z. B. needs-human); `anlegen` legt ein fehlendes Label im Team an (kriterien-unklar). */
export async function labelSetzen(issueId: string, teamId: string, name: string, anlegen = false) {
  const d = await linear<{ team: { labels: { nodes: { id: string; name: string }[] } } }>(`query($t: String!) { team(id: $t) { labels(first: 250) { nodes { id name } } } }`, { t: teamId });
  let l = d.team.labels.nodes.find((x) => x.name.toLowerCase() === name);
  if (!l && anlegen && !DRY) {
    const neu = await linear<{ issueLabelCreate: { issueLabel: { id: string; name: string } } }>(`mutation($t: String!, $n: String!) { issueLabelCreate(input: { teamId: $t, name: $n }) { issueLabel { id name } } }`, { t: teamId, n: name });
    l = neu.issueLabelCreate.issueLabel;
  }
  if (!l) throw new Error(`Linear-Label „${name}“ nicht gefunden`);
  if (DRY) return console.log(`[trocken] Label ${name}`);
  await linear(`mutation($id: String!, $l: [String!]) { issueUpdate(id: $id, input: { addedLabelIds: $l }) { success } }`, { id: issueId, l: [l.id] });
}
