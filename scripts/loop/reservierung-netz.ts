// SIN-1052: bestehende Loop-CLI in abgegrenzte Module zerlegt; Policy und Vertrauensgrenzen bleiben erhalten.
import { type ProjektKnoten } from "../../src/lib/loop/projekt-issues";
import { fehlergrund } from "../../src/lib/loop/fehlergrund";
import { type LinearIssue, type GithubIssue, offeneSpiegel } from "../../src/lib/loop/auswahl";
import { type ProviderStand, type Ereignis, planeFallback, reserviere } from "../../src/lib/loop/fallback";
import { OHNE_DIFF_SCHRITT, zaehleOhneDiff, type WorkerLauf, beendeterLaufOhnePr, MAX_OHNE_DIFF, ohneDiffGrund } from "../../src/lib/loop/ohne-pr";
import { type ReservierungsSpeicher, supabaseReservierung, auftragAus, type Reservierung } from "../../src/lib/loop/reservierung";
import { env, ereignis, laufUrl, DRY, gh } from "./netz";
import { setzeStatus, labelSetzen, kommentar } from "./linear-netz";

// ------------------------------------------------------------------ Reservierung (SIN-832)

/** Dauerhafte issueweite Sperre in `leitstand_aufgaben`. Ohne Supabase gibt es keine Sperre und damit keinen Start. */
export function reservierungen(titel?: Map<string, string>): ReservierungsSpeicher | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return supabaseReservierung({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY, titel: (id) => titel?.get(id) });
}

/** Claude: der Dispatcher läuft nur ohne aktive Claude-Pause (oben geprüft). Codex: kein belegter Start-Adapter (SIN-832, Zuordnungsfehler). */
const CLAUDE_FREI: ProviderStand = { adapter: true, fehler: null, bis: null, versuche: 0 };

const CODEX_OHNE_ADAPTER: ProviderStand = { adapter: false, fehler: null, bis: null, versuche: 0 };

/** Strukturiertes Ereignis als JSON im vorhandenen Feld `grund` (loop_events hat keine payload-Spalte, SIN-848). */
const alsGrund = (art: string, e: Ereignis) => `reservierung_${art}: ${JSON.stringify(e)}`;

/**
 * Vor dem Start: Stand laden, Policy fragen, atomar reservieren. Nur bei bestätigter Reservierung startet ein Worker.
 * Speicherfehler, verlorener Compare-and-swap oder ein vorhandener Claim verhindern den Start; nichts wird blind freigegeben.
 */
export async function reserviereStart(speicher: ReservierungsSpeicher | null, i: LinearIssue, projekt: string): Promise<boolean> {
  if (!speicher) {
    await ereignis("dispatch", "uebersprungen", { projekt, issue: i.identifier, grund: "reservierung_fehlt: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt, kein Start ohne dauerhafte Sperre (SIN-832)" });
    return false;
  }
  const links = [laufUrl()].filter((x): x is string => !!x);
  let stand;
  try {
    stand = await speicher.laden(i.identifier);
  } catch (e) {
    await ereignis("dispatch", "fehler", { projekt, issue: i.identifier, grund: fehlergrund(`reservierung_unlesbar: ${(e as Error).message}`) });
    return false;
  }
  const a = auftragAus(stand, { pr: null, branch: null, codexGeeignet: false });
  const e = planeFallback(a, { claude: CLAUDE_FREI, codex: CODEX_OHNE_ADAPTER }, new Date(), links);
  if (e.status !== "startbereit") {
    await ereignis("dispatch", "uebersprungen", { projekt, issue: i.identifier, grund: alsGrund(e.status, e) });
    return false;
  }
  const claim = `gh-${env.GITHUB_RUN_ID ?? "lokal"}-${i.identifier}`;
  if (!(await reserviere(a, e, claim, speicher))) {
    await ereignis("dispatch", "uebersprungen", { projekt, issue: i.identifier, grund: alsGrund("verloren", { ...e, status: "wartend" }) });
    return false;
  }
  console.log(`Reserviert: ${i.identifier} (${claim}, Revision ${a.revision + 1}).`);
  return true;
}

/** Nach belegtem Ende (Merge, Stopp): Claim lösen. Fehler werden gemeldet, der Reparaturzähler bleibt stehen. */
export async function gibFrei(id: string, nachweis: string, projekt?: string, erfolg = false) {
  const speicher = reservierungen();
  if (!speicher || DRY) return;
  try {
    const r = await speicher.laden(id);
    if ((r.claim || (erfolg && r.reparaturen > 0)) && !(await speicher.freigeben(r, nachweis, erfolg))) console.log(`::warning::${id}: Claim nicht freigegeben (Stand geändert oder Beleg ungültig).`);
  } catch (e) {
    await ereignis("merge", "fehler", { projekt, issue: id, grund: fehlergrund(`reservierung_freigabe: ${(e as Error).message}`) });
  }
}

/** Läuft oder wartet genau dieser Lauf (Run-ID aus dem Claim)? `null`, wenn das nicht lesbar ist: dann bleibt der Claim. */
export async function laufAktiv(repo: string, runId: string): Promise<boolean | null> {
  try {
    const d = await gh<{ status: string }>(`/repos/${repo}/actions/runs/${runId}`);
    return d.status !== "completed";
  } catch {
    return null;
  }
}

/** Frühere Ereignisse `worker` und `merge` eines Issues (neueste zuerst) für die Zählung ohne Diff; bei Lesefehler wirft es (dann kein Eingriff). */
async function ohneDiffBisher(projekt: string, issue: string): Promise<number> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY!;
  const q = new URLSearchParams({ project: `eq.${projekt}`, issue: `eq.${issue}`, step: `in.(${OHNE_DIFF_SCHRITT},merge)`, select: "step,grund", order: "created_at.desc", limit: "20" });
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events?${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`loop_events: HTTP ${res.status}`);
  return zaehleOhneDiff((await res.json()) as { step: string; grund: string | null }[]);
}

/**
 * SIN-937: Claims, deren claude.yml-Lauf ohne PR endete. Je Treffer: Claim frei (Beleg = Lauf-URL), Lauf zählen, Linear zurück auf Todo,
 * Spiegel schließen; beim zweiten Lauf ohne Diff zusätzlich `needs-human`. Fehler einzelner Issues stoppen die anderen nicht.
 */
export async function laeufeOhnePr(
  repo: string, projekt: string, claims: Reservierung[], issues: LinearIssue[], nodes: ProjektKnoten[], speicher: ReservierungsSpeicher,
  offen: { title: string }[], zuletzt: { title: string; merged_at: string | null }[],
): Promise<{ id: string; stopp: boolean }[]> {
  const kandidaten = claims.filter((r) => r.provider === "claude" && issues.some((i) => i.identifier === r.issue));
  if (!kandidaten.length) return [];
  const laeufe = await gh<{ workflow_runs: { id: number; display_title: string; status: string; conclusion: string | null; run_started_at: string | null; created_at: string; html_url: string }[] }>(`/repos/${repo}/actions/workflows/claude.yml/runs?per_page=50`)
    .then((d) => d.workflow_runs.map((l): WorkerLauf => ({ id: l.id, titel: l.display_title, status: l.status, conclusion: l.conclusion, gestartet: l.run_started_at ?? l.created_at, url: l.html_url })), (e: Error) => (console.log(`::warning::claude.yml-Läufe nicht lesbar: ${e.message}`), [] as WorkerLauf[]));
  const prs = [...offen.map((p) => ({ titel: p.title, offen: true, gemergtAm: null })), ...zuletzt.map((p) => ({ titel: p.title, offen: false, gemergtAm: p.merged_at }))];
  const fertig: { id: string; stopp: boolean }[] = [];
  for (const r of kandidaten) {
    const lauf = beendeterLaufOhnePr(r, laeufe, prs);
    if (!lauf) continue;
    try {
      const n = (await ohneDiffBisher(projekt, r.issue)) + 1;
      // Zuerst freigeben: gelingt das nicht (Stand geändert, Beleg ungültig), bleibt alles wie es war und der nächste Dispatch versucht es erneut.
      if (!(await speicher.freigeben(r, lauf.url))) continue;
      const stopp = n >= MAX_OHNE_DIFF;
      const i = issues.find((x) => x.identifier === r.issue)!;
      const team = nodes.find((x) => x.id === i.id)!.team.id;
      await ereignis("worker", "uebersprungen", { projekt, issue: r.issue, grund: ohneDiffGrund(lauf, n) });
      await setzeStatus(i.id, team, "Todo");
      if (stopp) await labelSetzen(i.id, team, "needs-human");
      await kommentar(i.id, `Loop: Worker-Lauf ${lauf.url} endete ohne PR (Lauf ${n} von ${MAX_OHNE_DIFF} ohne Diff, SIN-937). ${stopp ? "Kein weiterer Start, Sinan entscheidet. Danach needs-human entfernen." : "Der Claim ist frei, das Issue startet noch einmal."}`);
      const spiegel = await gh<GithubIssue[]>(`/repos/${repo}/issues?labels=claude&state=open&per_page=100`);
      for (const nr of offeneSpiegel(spiegel, r.issue)) await gh(`/repos/${repo}/issues/${nr}`, { method: "PATCH", body: { state: "closed" } });
      console.log(`${r.issue}: Worker-Lauf ${lauf.id} ohne PR, Claim frei (${n}/${MAX_OHNE_DIFF})${stopp ? ", needs-human" : ""}`);
      fertig.push({ id: r.issue, stopp });
    } catch (e) {
      await ereignis("dispatch", "fehler", { projekt, issue: r.issue, grund: fehlergrund(`worker_ohne_pr: ${(e as Error).message}`) });
    }
  }
  return fertig;
}
