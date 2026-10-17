/**
 * Push-Auslöser (SIN-426, SIN-421). Aufruf aus .github/workflows/push-ausloeser.yml (alle 15 Minuten):
 *
 *   npx tsx scripts/push/ausloeser.ts
 *
 * Liest loop_snapshot und loop_events (Supabase), baut „Braucht dich“ genau wie die Startseite (`karten`) und den
 * Stillstand der Schlange, entscheidet mit `plane()` (Ruhezeit 22–7 Uhr, Auswertung 20 Uhr), sendet an alle Abos und
 * merkt sich Gesendetes in `leitstand_push_gesendet`. Kein KI-Aufruf.
 *
 * Dazu (Sinan 13.10.) „Fertig und live“ für gemergte feat/fix-PRs und „Worker abgebrochen“ für gescheiterte Worker-Läufe (GitHub).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
 *      GH_TOKEN (AGENT_WORKFLOW_TOKEN, lesend), LINEAR_API_KEY (nur für Titel). Ohne GH_TOKEN entfallen Fertig und Abbruch.
 * DRY_RUN=1: nur Ausgabe im Log, nichts gesendet oder gespeichert.
 */
import { createClient } from "@supabase/supabase-js";
import { alarmeAus } from "../../src/lib/abnahme/abnahme";
import { abbruchAus, brauchtDichAus, fertigAus, FERTIG_FENSTER_NACHT_MS, menschlich, planerOhneTodosAus, plane, produktFertigAus, rollenStillstandAus, stillstandAus, type GemergterPr, type Schlange, type Wartendes, type WorkerLauf } from "../../src/lib/push/ausloeser";
import { REPOS, type RepoName } from "../../src/lib/freigabe";
import { projektAusLinear, statusAusLinear } from "../../src/lib/aufgaben";
import { leseHaken } from "../../src/lib/loop/haken";
import { OHNE_TODOS_SCHRITT } from "../../src/lib/vorarbeiter/vorarbeiter";
import { sendeAnAlle } from "../../src/lib/push/push";
import { supabaseSpeicher, vapidSender } from "../../src/lib/push/server";
import { projektInfo } from "../../src/lib/projekte";
import { ladeQuelle, type Lesequelle } from "../../src/lib/supabase";
import { karten } from "../../src/lib/uebersicht-einfach";
import { offene } from "../../src/lib/migrationen/migrationen";
import { wartendePrs } from "../../src/lib/wartende-prs";
import { EINSTELLUNG, pushStunde, pushVorbereiten } from "../../src/lib/wochencheck/wochencheck";
import { pruefeRollen } from "../../src/lib/autonomy/rollen";
import { pausenAlarme, type RollenEreignis } from "../../src/lib/wirkung/wirkung";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const MERKEN_TAGE = 14;
/** Worker-Workflow je Repo: Lern-App `worker.yml`, Leitstand `claude.yml`. */
const WORKER: Record<RepoName, string> = { "siinanXD/Content-Agent-Lernapp": "worker.yml", "siinanXD/Leitstand": "claude.yml" };

async function github<T>(pfad: string): Promise<T | null> {
  if (!env.GH_TOKEN) return null;
  const res = await fetch(`https://api.github.com/${pfad}`, { headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    console.log(`::warning::GitHub ${pfad.split("?")[0]}: HTTP ${res.status}`);
    return null;
  }
  return (await res.json()) as T;
}

/** Titel aus Linear für Kennungen wie SIN-456; fehlt der Schlüssel oder klappt es nicht, bleibt der Lauf-Titel. */
async function linearTitel(ids: string[]): Promise<Map<string, string>> {
  const titel = new Map<string, string>();
  if (!env.LINEAR_API_KEY || ids.length === 0) return titel;
  const query = `{ ${ids.map((id, i) => `a${i}: issue(id: "${id}") { title }`).join(" ")} }`;
  try {
    const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { "Content-Type": "application/json", Authorization: env.LINEAR_API_KEY }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(15_000) });
    const json = (await res.json()) as { data?: Record<string, { title?: string } | null> };
    ids.forEach((id, i) => {
      const t = json.data?.[`a${i}`]?.title;
      if (t) titel.set(id, t);
    });
  } catch (e) {
    console.log(`::warning::Linear-Titel: ${e instanceof Error ? e.message : e}`);
  }
  return titel;
}

/**
 * Titel und Stand der Linear-Aufgaben der letzten 30 Tage nach `leitstand_aufgaben` (Sinan 13.10.: „Da steht nur ‚Eine Aufgabe‘“).
 * Ohne LINEAR_API_KEY oder bei Fehlern: Warnung, die Mitteilungen laufen trotzdem.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Client ohne erzeugte Typen
async function aufgabenSpiegeln(db: any): Promise<void> {
  if (!env.LINEAR_API_KEY) return console.log("::warning::LINEAR_API_KEY fehlt: Aufgabentitel werden nicht gespiegelt.");
  const seit = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString();
  const query = `query($seit: DateTimeOrDuration!) { issues(first: 250, orderBy: updatedAt, filter: { updatedAt: { gt: $seit } }) { nodes { identifier title description startedAt completedAt canceledAt state { type } project { name } labels { nodes { name } } parent { identifier } relations { nodes { relatedIssue { identifier } } } } } }`;
  try {
    const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { "Content-Type": "application/json", Authorization: env.LINEAR_API_KEY }, body: JSON.stringify({ query, variables: { seit } }), signal: AbortSignal.timeout(20_000) });
    const json = (await res.json()) as { data?: { issues?: { nodes?: { identifier: string; title: string; description: string | null; startedAt: string | null; completedAt: string | null; canceledAt: string | null; state?: { type?: string }; project?: { name?: string } | null; labels?: { nodes?: { name: string }[] }; parent?: { identifier: string } | null; relations?: { nodes?: { relatedIssue?: { identifier: string } | null }[] } }[] } }; errors?: { message: string }[] };
    if (json.errors?.length) throw new Error(json.errors[0].message);
    const zeilen = (json.data?.issues?.nodes ?? []).map((i) => {
      const haken = leseHaken(i.description);
      return {
      issue: i.identifier,
      haken_gesamt: haken.length,
      haken_erledigt: haken.filter((h) => h.erledigt).length,
      titel: i.title,
      projekt: projektAusLinear(i.project?.name),
      status: statusAusLinear(i.state?.type),
      gestartet_at: i.startedAt,
      fertig_at: i.completedAt ?? i.canceledAt,
      labels: (i.labels?.nodes ?? []).map((l) => l.name),
      bezug: [i.parent?.identifier, ...(i.relations?.nodes ?? []).map((r) => r.relatedIssue?.identifier)].filter((x): x is string => !!x),
      aktualisiert_at: new Date().toISOString(),
      };
    });
    if (DRY) return console.log(`Aufgaben (Trockenlauf): ${zeilen.length}`);
    let { error } = await db.from("leitstand_aufgaben").upsert(zeilen as never, { onConflict: "issue" });
    // Migration 20261016100000 noch nicht eingespielt: ohne Haken-Spalten spiegeln, damit Titel und Stand weiterlaufen.
    if (error && /haken_|bezug/.test(error.message)) ({ error } = await db.from("leitstand_aufgaben").upsert(zeilen.map((z) => Object.fromEntries(Object.entries(z).filter(([k]) => !k.startsWith("haken_") && k !== "bezug"))) as never, { onConflict: "issue" }));
    if (error) throw new Error(error.message);
    console.log(`Aufgaben gespiegelt: ${zeilen.length}`);
  } catch (e) {
    console.log(`::warning::Aufgaben nicht gespiegelt: ${e instanceof Error ? e.message : e}`);
  }
}

/** Gemergte PRs der letzten Stunden und alle Aufgaben-Kennungen, zu denen es einen offenen oder frisch gemergten PR gibt. */
async function prLage(jetzt: Date): Promise<{ gemergt: GemergterPr[]; mitPr: Set<string> }> {
  const gemergt: GemergterPr[] = [];
  const mitPr = new Set<string>();
  for (const repo of Object.keys(REPOS) as RepoName[]) {
    const [zu, offen] = await Promise.all([
      github<{ number: number; title: string; merged_at: string | null }[]>(`repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=30`),
      github<{ title: string }[]>(`repos/${repo}/pulls?state=open&per_page=50`),
    ]);
    for (const p of offen ?? []) for (const id of p.title.match(/SIN-\d+/g) ?? []) mitPr.add(id);
    for (const p of zu ?? []) {
      const zeit = p.merged_at ? Date.parse(p.merged_at) : NaN;
      if (!Number.isFinite(zeit) || jetzt.getTime() - zeit > FERTIG_FENSTER_NACHT_MS) continue;
      gemergt.push({ repo, projekt: projektInfo(REPOS[repo].projekt).name, nummer: p.number, titel: p.title, gemergt: zeit });
      for (const id of p.title.match(/SIN-\d+/g) ?? []) mitPr.add(id);
    }
  }
  return { gemergt, mitPr };
}

async function workerLaeufe(jetzt: Date): Promise<WorkerLauf[]> {
  const seit = new Date(jetzt.getTime() - 3 * 3_600_000).toISOString();
  const roh: (Omit<WorkerLauf, "titel"> & { rohTitel: string })[] = [];
  for (const repo of Object.keys(REPOS) as RepoName[]) {
    const antwort = await github<{ workflow_runs: { display_title: string; conclusion: string | null; status: string; updated_at: string }[] }>(`repos/${repo}/actions/workflows/${WORKER[repo]}/runs?per_page=50&created=%3E${seit}`);
    for (const r of antwort?.workflow_runs ?? []) {
      const issue = r.display_title.match(/SIN-\d+/)?.[0];
      if (!issue || r.status !== "completed" || !r.conclusion) continue;
      roh.push({ repo, projekt: projektInfo(REPOS[repo].projekt).name, issue, ergebnis: r.conclusion, ende: Date.parse(r.updated_at), rohTitel: r.display_title });
    }
  }
  const titel = await linearTitel([...new Set(roh.filter((r) => r.ergebnis === "failure").map((r) => r.issue))]);
  const ersatz = (roh: string) => {
    const t = menschlich(roh.replace(/^worker\s+/i, "").replace(/^SIN-\d+:\s*/, "")).trim();
    return !t || /^SIN-\d+$/.test(t) ? "eine Aufgabe" : t;
  };
  return roh.map(({ rohTitel, ...r }) => ({ ...r, titel: titel.get(r.issue) ?? ersatz(rohTitel) }));
}

async function main() {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("::warning::SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt, nichts zu tun.");
    return;
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  await aufgabenSpiegeln(db);
  const speicher = supabaseSpeicher(url, key);
  const abos = await speicher.alle();
  // Ohne Abo nichts als gesendet merken: wer den Schalter einschaltet, bekommt beim nächsten Lauf den aktuellen Stand.
  if (abos.length === 0 && !DRY) {
    console.log("Kein Abo: Schalter „Mitteilungen“ in den Einstellungen der Home-Bildschirm-App ist aus.");
    return;
  }
  const sender = vapidSender();
  if (!sender && !DRY) {
    console.log("::warning::VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY oder VAPID_SUBJECT fehlt: keine Mitteilung möglich.");
    return;
  }

  const jetzt = new Date();
  const geladen = await ladeQuelle(db as unknown as Lesequelle, jetzt);
  if (geladen.zustand !== "ok") throw new Error("loop_events oder loop_snapshot nicht lesbar");
  const q = geladen.quelle;

  // Fehlende Migrationen gehen als Alarm raus (unten), nicht als „Braucht dich“.
  // Freigaben öffnen mit einem Tipp die Freigabe-Seite (SIN-635); der Grund steht im Satz, damit klar ist, was zu tun ist.
  const wartend: Wartendes[] = karten(q, wartendePrs(q.snapshot))
    .filter((k) => !k.key.startsWith("migration:"))
    .map((k) => (k.wartender ? { key: k.key, titel: `${k.titel}: ${k.warum} Bitte freigeben.`, projekt: k.projekt || "Leitstand", url: "/freigabe" } : { key: k.key, titel: k.titel, projekt: k.projekt || "Leitstand" }));
  // Neue Linear-Aufgaben mit Label `sinan` (aus dem Spiegel oben), die noch offen sind.
  const { data: sinanAufgaben, error: fehlerSinan } = await db.from("leitstand_aufgaben").select("issue, titel, status").contains("labels", ["sinan"]).in("status", ["offen", "laeuft"]);
  if (fehlerSinan) console.log(`::warning::sinan-Aufgaben nicht lesbar: ${fehlerSinan.message}`);
  for (const a of (sinanAufgaben ?? []) as { issue: string; titel: string }[])
    if (!wartend.some((w) => w.key === a.issue)) wartend.push({ key: a.issue, titel: `${a.issue} ${a.titel}: wartet auf dich`, projekt: "Leitstand", url: `https://linear.app/sinan-kahraman/issue/${a.issue}` });

  // shortcut: Stillstand nur für Projekte mit `queue` im Snapshot (Lern-App); der Leitstand bekommt seine Schlange mit SIN-572.
  const { data: rohSchlangen, error } = await db.from("loop_snapshot").select("project, queue");
  if (error) throw new Error(`loop_snapshot.queue: ${error.message}`);
  const schlangen: Schlange[] = (rohSchlangen ?? []).map((r: { project: string; queue: Record<string, unknown> | null }) => {
    const queue = r.queue ?? {};
    const letztes = q.events.find((e) => e.project === r.project);
    return {
      projekt: r.project,
      name: projektInfo(r.project).name,
      startbar: Number(queue.startable ?? 0),
      laeuft: Number(queue.running ?? 0) + Number(queue.in_progress ?? 0),
      pausiert: queue.paused === true,
      letztesEreignis: letztes ? Date.parse(letztes.created_at) : null,
    };
  });

  const [prs, laeufe] = await Promise.all([prLage(jetzt), workerLaeufe(jetzt)]);
  const ereignisse = [
    ...brauchtDichAus(wartend, jetzt.getTime()),
    ...offene(q.events).map((m) => ({ id: `alarm:migration:${m.datei}`, art: "alarm" as const, projekt: "Leitstand", kennung: "Datenbank", titel: `${m.datei}: ${m.grund}`, zeit: m.zeit })),
    ...alarmeAus(q.events, jetzt.getTime()),
    ...pausenAlarme(q.events as unknown as RollenEreignis[], jetzt.getTime()),
    ...stillstandAus(schlangen, jetzt.getTime()),
    ...rollenStillstandAus(pruefeRollen(q.events, jetzt.getTime()), "Leitstand", jetzt.getTime()),
    ...planerOhneTodosAus(q.events.filter((e) => e.step === OHNE_TODOS_SCHRITT).map((e) => ({ projekt: e.project ?? "", name: projektInfo(e.project ?? "").name, zeit: Date.parse(e.created_at) })), jetzt.getTime()),
    ...fertigAus(prs.gemergt, jetzt.getTime()),
    ...produktFertigAus(q.events.filter((e) => e.step === "produkt-fertig").map((e) => ({ projekt: projektInfo(e.project ?? "").name, zeit: Date.parse(e.created_at) }))),
    ...abbruchAus(laeufe, jetzt.getTime(), prs.mitPr),
  ];
  const ab = new Date(jetzt.getTime() - MERKEN_TAGE * 24 * 3_600_000).toISOString();
  const { data: rohGesendet, error: fehlerGesendet } = await db.from("leitstand_push_gesendet").select("schluessel").gte("gesendet_at", ab);
  if (fehlerGesendet) throw new Error(`leitstand_push_gesendet: ${fehlerGesendet.message}`);
  const gesendet = new Set((rohGesendet ?? []).map((r: { schluessel: string }) => r.schluessel));

  const plan = plane(ereignisse, gesendet, jetzt.getTime());
  // Wochen-Check (SIN-631): sonntags zur eingestellten Stunde; fehlt die Einstellung (Migration offen), gilt 19 Uhr.
  const { data: stunde } = await db.from("leitstand_einstellungen").select("wert").eq("schluessel", EINSTELLUNG);
  const woche = pushVorbereiten(jetzt.getTime(), pushStunde(stunde?.[0]?.wert), gesendet);
  if (woche) {
    plan.nachrichten.push(woche.nachricht);
    plan.neu.push(woche.schluessel);
  }
  console.log(`Abos: ${abos.length}, Ereignisse: ${ereignisse.length}, Mitteilungen: ${plan.nachrichten.length}`);
  for (const n of plan.nachrichten) console.log(`- ${n.titel}: ${n.text.replace(/\n/g, " / ")}`);
  if (DRY || plan.nachrichten.length === 0) return;

  for (const n of plan.nachrichten) {
    const r = await sendeAnAlle(speicher, sender!, n);
    console.log(`  ${n.titel}: zugestellt ${r.gesendet}, abgelaufen ${r.entfernt}, Fehler ${r.fehler}`);
  }
  // Auch bei einzelnen Fehlern merken: sonst kommt dieselbe Mitteilung alle 15 Minuten wieder.
  if (plan.neu.length) {
    const { error: fehlerMerken } = await db.from("leitstand_push_gesendet").upsert(plan.neu.map((schluessel) => ({ schluessel })), { onConflict: "schluessel", ignoreDuplicates: true });
    if (fehlerMerken) throw new Error(`Gesendetes nicht gespeichert: ${fehlerMerken.message}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
