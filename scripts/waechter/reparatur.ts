/**
 * Hänger und Reparaturen des Projekt-Wächters (SIN-419, SIN-832): Issues ohne PR zurücksetzen, rote PRs reparieren lassen,
 * verwaiste Claims lösen. Aus scripts/waechter/waechter.ts herausgelöst (SIN-915), Verhalten unverändert.
 */
import { ladePausenAlle } from "../kontingent/pausen";
import { linearId, MAX_REPARATUR, offeneSpiegel, type GithubIssue } from "../../src/lib/loop/auswahl";
import { supabaseReservierung, verwaist, type Reservierung, type ReservierungsSpeicher } from "../../src/lib/loop/reservierung";
import { erkenneIssueHaenger, erkennePrHaenger, MARKER_ZURUECK, reparaturText, type HaengerAktion, type PrInfo, type WaechterIssue } from "../../src/lib/waechter/waechter";
import { DRY, env, gh, jetzt, kommentar, linear, log, teamDaten } from "./netz";

type Team = Awaited<ReturnType<typeof teamDaten>>;

/** Supabase-Speicher für Claims und Reparaturzähler, ohne Secrets null. */
export const reservierungen = (): ReservierungsSpeicher | null =>
  env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? supabaseReservierung({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY }) : null;

/** SIN-760: Beim Zurücksetzen auf Todo den offenen Spiegel schließen, sonst bleibt das Issue „gespiegelt“. */
async function schliesseSpiegel(repo: string, offene: GithubIssue[], identifier: string) {
  for (const n of offeneSpiegel(offene, identifier)) {
    await gh(`/repos/${repo}/issues/${n}/comments`, { method: "POST", body: { body: "neu gestartet" } });
    await gh(`/repos/${repo}/issues/${n}`, { method: "PATCH", body: { state: "closed" } });
  }
}

/** Läuft oder wartet im Repo ein Worker-Lauf (claude.yml)? `null`, wenn das nicht lesbar ist: dann bleibt jeder Claim. */
async function workerLaeuft(repo: string): Promise<boolean | null> {
  try {
    for (const status of ["in_progress", "queued"]) {
      const d = await gh<{ total_count: number }>(`/repos/${repo}/actions/workflows/claude.yml/runs?status=${status}&per_page=1`);
      if (d.total_count > 0) return true;
    }
    return false;
  } catch {
    return null;
  }
}

/**
 * Verwaiste Claims mit Beleg lösen (kein offener PR, kein Spiegel, kein laufender Worker, älter als 6 h).
 * Beleg ist dieser Wächter-Lauf; ohne Lauf-URL (lokal) wird nichts freigegeben.
 */
export async function claimsAufraeumen(projekt: string, repo: string, ids: string[], prs: PrInfo[], gespiegelt: Set<string>, stand: Reservierung[]) {
  const speicher = reservierungen();
  const beleg = env.GITHUB_RUN_ID ? `https://github.com/${env.GITHUB_REPOSITORY ?? "siinanXD/Leitstand"}/actions/runs/${env.GITHUB_RUN_ID}` : null;
  if (!speicher || !stand.length) return;
  const laeuft = await workerLaeuft(repo);
  const mitPr = new Set(prs.map((p) => linearId(p.titel)).filter((x): x is string => !!x));
  for (const r of stand.filter((x) => x.claim && ids.includes(x.issue))) {
    if (!verwaist(r, { offenerPr: mitPr.has(r.issue), gespiegelt: gespiegelt.has(r.issue), workerLaeuft: laeuft, jetzt })) continue;
    log(projekt, `${r.issue}: Claim ${r.claim} verwaist (kein PR, kein Spiegel, kein laufender Worker, seit ${r.seit}) → freigeben`);
    if (DRY || !beleg) continue;
    if (!(await speicher.freigeben(r, beleg))) log(projekt, `${r.issue}: Freigabe verloren (Stand geändert), nächster Lauf prüft erneut`);
  }
}

/**
 * Nach dem Zurücksetzen auf Todo (Kontingent-Abbruch oder 6 h ohne PR, Spiegel gerade geschlossen) den Claim im selben
 * Schritt lösen; Beleg ist dieser Wächter-Lauf. Ohne Lauf-URL (lokal) oder Supabase bleibt er.
 */
async function claimNachZuruecksetzen(projekt: string, id: string, repo?: string) {
  const speicher = reservierungen();
  if (!speicher || !env.GITHUB_RUN_ID) return;
  // 6 h ohne PR ist nur Zeitablauf: lösen erst, wenn belegt kein Worker-Lauf mehr läuft oder wartet (sonst später claimsAufraeumen).
  if (repo && (await workerLaeuft(repo)) !== false) return log(projekt, `${id}: Claim bleibt, Worker-Lauf aktiv oder Zustand unbekannt`);
  const beleg = `https://github.com/${env.GITHUB_REPOSITORY ?? "siinanXD/Leitstand"}/actions/runs/${env.GITHUB_RUN_ID}`;
  try {
    const r = await speicher.laden(id);
    if (r.claim && !(await speicher.freigeben(r, beleg))) log(projekt, `${id}: Claim nach Zurücksetzen nicht gelöst (Stand geändert)`);
  } catch (e) {
    log(projekt, `${id}: Claim nach Zurücksetzen nicht lesbar: ${e instanceof Error ? e.message : e}`);
  }
}

/** Ein Hänger-Issue auf Todo zurücksetzen, Spiegel schließen, Claim lösen. */
async function setzeZurueck(h: HaengerAktion, team: Team, repo: string, offeneGh: GithubIssue[], projekt: string, text: string) {
  const todo = team.status("Todo");
  if (todo) await linear(`mutation($id: String!, $s: String!) { issueUpdate(id: $id, input: { stateId: $s }) { success } }`, { id: h.issue.id, s: todo });
  await kommentar(h.issue.id, text);
  await schliesseSpiegel(repo, offeneGh, h.issue.identifier);
  // Kontingent-Abbruch: Claim sofort lösen; Zeitablauf: erst, wenn kein Worker mehr läuft.
  await claimNachZuruecksetzen(projekt, h.issue.identifier, h.kontingent ? undefined : repo);
}

/** Hänger erkennen und behandeln. Ohne geladene PRs/Spiegel (`fehler`) wäre jeder Lauf ein „Hänger“: dann nichts zurücksetzen. */
export async function behandleHaenger(projekt: string, issues: WaechterIssue[], prs: PrInfo[], offeneGh: GithubIssue[], repo: string, team: Team, fehler: boolean) {
  const claudePausen = (await ladePausenAlle()).filter((p) => p.dienst === "claude").map((p) => p.erstellt_at);
  const haenger = fehler ? [] : erkenneIssueHaenger(issues, prs, jetzt, claudePausen);
  for (const h of haenger) {
    if (h.kontingent) {
      log(projekt, `${h.issue.identifier} scheiterte am Claude-Kontingent → zurück auf Todo`);
      if (!DRY) await setzeZurueck(h, team, repo, offeneGh, projekt, "Wächter: Der Lauf scheiterte am Claude-Kontingent, kein Hänger. Zurück auf Todo, startet nach der Pause von selbst.");
    } else if (h.art === "zuruecksetzen") {
      log(projekt, `${h.issue.identifier} hängt seit über 6 h ohne PR → zurück auf Todo`);
      if (!DRY) await setzeZurueck(h, team, repo, offeneGh, projekt, `Wächter: seit über 6 Stunden In Progress ohne offenen PR. Zurück auf Todo (einmalig). ${MARKER_ZURUECK}`);
    } else {
      log(projekt, `${h.issue.identifier} hängt erneut → needs-human`);
      if (DRY) continue;
      const l = team.label("needs-human");
      if (l) await linear(`mutation($id: String!, $l: [String!]) { issueUpdate(id: $id, input: { addedLabelIds: $l }) { success } }`, { id: h.issue.id, l: [l] });
      await kommentar(h.issue.id, "Wächter: hängt zum zweiten Mal ohne PR. Sinan entscheidet (needs-human).");
    }
  }
  return haenger;
}

/**
 * Erst issueweit zählen, dann bitten. Ohne lesbaren Stand oder bei verlorenem Compare-and-swap keine Runde.
 * PRs ohne Linear-Kennung (z. B. Dependabot) und Läufe ohne Supabase zählen wie bisher nur über Labels.
 */
async function darfReparieren(projekt: string, pr: PrInfo, speicher: ReservierungsSpeicher | null, lesbar: boolean): Promise<boolean> {
  const id = linearId(pr.titel);
  if (!id || !speicher) return true;
  const r = lesbar ? await speicher.laden(id).catch(() => null) : null;
  // Frisch geladenen Stand erneut gegen die Grenze prüfen, bevor gezählt wird.
  if (r && r.reparaturen >= MAX_REPARATUR) {
    log(projekt, `PR #${pr.number}: ${id} hat ${r.reparaturen} Runden (issueweit) → keine weitere`);
    return false;
  }
  if (!r || !(await speicher.zaehleReparatur(r, pr.titel).catch(() => false))) {
    log(projekt, `PR #${pr.number}: Reparaturzähler für ${id} nicht gezählt (Stand fehlt oder geändert) → keine Runde`);
    return false;
  }
  return true;
}

/** Rote PRs: `@claude` um Reparatur bitten oder nach MAX_REPARATUR Runden needs-human. */
export async function behandlePrHaenger(projekt: string, repo: string, prs: PrInfo[], zaehler: Map<string, number>, speicher: ReservierungsSpeicher | null, lesbar: boolean) {
  for (const a of erkennePrHaenger(prs, jetzt, zaehler)) {
    if (a.art === "reparatur") {
      log(projekt, `PR #${a.pr.number} rot ohne Commit → @claude, Runde ${a.runde}`);
      if (DRY || !(await darfReparieren(projekt, a.pr, speicher, lesbar))) continue;
      await gh(`/repos/${repo}/issues/${a.pr.number}/labels`, { method: "POST", body: { labels: [`repair:${a.runde}`] } });
      await gh(`/repos/${repo}/issues/${a.pr.number}/comments`, { method: "POST", body: { body: reparaturText(a.pr, a.runde) } });
    } else {
      log(projekt, `PR #${a.pr.number} nach ${MAX_REPARATUR} Runden noch rot → needs-human`);
      if (DRY) continue;
      await gh(`/repos/${repo}/issues/${a.pr.number}/labels`, { method: "POST", body: { labels: ["needs-human"] } });
      await gh(`/repos/${repo}/issues/${a.pr.number}/comments`, {
        method: "POST",
        body: { body: `Wächter: build ist nach ${MAX_REPARATUR} Reparaturrunden noch rot${a.pr.runUrl ? ` (${a.pr.runUrl})` : ""}. Stopp, Sinan entscheidet.` },
      });
    }
  }
}
