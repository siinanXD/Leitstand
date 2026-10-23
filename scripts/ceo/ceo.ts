/**
 * CEO-Agent (SIN-542, schlank seit SIN-636). Aufruf aus ceo.yml (.github/workflows/ceo.yml), einmal täglich:
 *
 *   CEO_AUSLOESER=taeglich npx tsx scripts/ceo/ceo.ts
 *
 * Liest loop_snapshot und loop_events (Supabase) und GitHub (gemergte Meta-PRs), entscheidet je Produkt genau eine Sache
 * (weiterbauen | warten | fertig, src/lib/ceo/ceo.ts) und schreibt eine Zeile in `ceo_entscheidungen` sowie ein Ereignis `rolle_gestartet` in `loop_events`.
 * Kein KI-Aufruf. Kein Geld, keine DB-Änderung, keine Freigabe. Issues legt der Planer an (scripts/vorarbeiter/vorarbeiter.ts), nicht der CEO.
 *
 * Entscheidet für alle Produkte mit Repo (fehlt die Snapshot-Zeile: warten, „keine Daten“). Bei `fertig` ruft er den Visionär.
 *
 * Env: GH_TOKEN (AGENT_WORKFLOW_TOKEN), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CEO_AUSLOESER, CEO_ROT (optional: "produkt=Grund;…" aus Live-Check/Sentry).
 * DRY_RUN=1 oder fehlende Supabase-Variablen: nur Ausgabe im Log, nichts geschrieben.
 */
import { AUSLOESER, bezugVon, ereignisZeile, entscheide, FERTIG_SCHRITT, fertigMeldung, entscheidungsZeile, gedaechtnisZeile, ohneDaten, startbar, type Ausloeser, type Entscheidung, type ProduktLage } from "../../src/lib/ceo/ceo";
import { rolleAus } from "../../src/lib/autonomy/rollen";
import { REPOS } from "../../src/lib/freigabe";
import { PROJEKTE } from "../../src/lib/projekte";
import { parseEvents, parseSnapshot, type LoopEvent, type SnapshotRow } from "../../src/lib/uebersicht";
import { fortschritt } from "../../src/lib/uebersicht-einfach";
import { aufgabenFuerDich } from "../../src/lib/uebersicht-b1";
import { wartendePrs } from "../../src/lib/wartende-prs";
import { fokusVon, standZeile, staende } from "../../src/lib/visionaer/visionaer";

const env = process.env;
const DRY = env.DRY_RUN === "1" || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY;
const ausloeser: Ausloeser = AUSLOESER.find((a) => a === env.CEO_AUSLOESER) ?? "taeglich";
const META = /^\w+\((loop|meta|waechter|gedaechtnis|ceo|agenten)\)/i;
const ROT = /fail|error|abort|crash|red|rot|stuck|timeout/i;
const TAG = 24 * 3_600_000;

const kopf = { apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? "", Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`, "Content-Type": "application/json" };
async function supabase(pfad: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${pfad}`, { method: body ? "POST" : "GET", headers: kopf, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`Supabase ${pfad.split("?")[0]}: ${res.status}`);
  return body ? null : res.json();
}

/** Heute gemergte Loop-/Meta-PRs je Repo. Ohne Token oder bei Fehler 0: die Regel greift dann nicht, ist aber im Log vermerkt. */
async function metaPrsHeute(repo: string | undefined, seit: Date): Promise<number> {
  if (!repo || !env.GH_TOKEN) return 0;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=50`, { headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json" } });
    if (!res.ok) return 0;
    const liste = (await res.json()) as { title: string; merged_at: string | null }[];
    return liste.filter((p) => p.merged_at && new Date(p.merged_at) >= seit && META.test(p.title)).length;
  } catch {
    return 0;
  }
}

/** `CEO_ROT="lernapp=die kaputte Live-Prüfung;leitstand=Sentry"`; zusätzlich ein rotes Ereignis eines Live-Checks oder von Sentry in den Daten. */
function rotVon(id: string, name: string, events: LoopEvent[]): string | null {
  const gesetzt = (env.CEO_ROT ?? "").split(";").map((s) => s.split("=")).find(([k]) => k.trim() === id)?.[1]?.trim();
  if (gesetzt) return gesetzt;
  const neuestes = events.find((e) => e.project === id && /live|sentry/i.test(e.step ?? ""));
  return neuestes?.status && ROT.test(neuestes.status) ? `die rote ${/sentry/i.test(neuestes.step ?? "") ? "Sentry-Meldung" : "Live-Prüfung"} von ${name}` : null;
}

const projektName = (id: string | null) => (id ? (PROJEKTE.find((x) => x.id === id)?.name ?? id) : null);

/** `fertig` (SIN-573): Dispatcher des Produkts stoppen (VERSION `pause`) und den Visionär starten (visionaer.yml). Baut erst weiter, wenn Sinan „go“ gibt. */
async function visionaerRufen(produkt: string) {
  // SIN-941: Pausierte Rolle (`takt: aus` in rollen.json, Fokus SIN-627) wird nicht gestartet und der Dispatcher nicht gestoppt.
  if (rolleAus("visionaer")) return console.log(`${produkt}: fertig, Visionär pausiert (rollen.json), nicht gerufen`);
  console.log(`${DRY ? "[trocken] " : ""}${produkt}: fertig, Dispatcher stoppen und Visionär rufen`);
  if (DRY) return;
  await supabase("loop_events", standZeile(produkt, "pause", ""));
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/visionaer.yml/dispatches`, { method: "POST", headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json" }, body: JSON.stringify({ ref: "main", inputs: { produkt } }) });
  // Der Stand `pause` gilt trotzdem: lieber nichts bauen als ohne Plan weiterlaufen. Fehlt visionaer.yml noch, steht es hier im Log.
  if (!res.ok) console.log(`::warning::visionaer.yml nicht gestartet (${res.status}).`);
}

/** `fertig` mit allen Haken (SIN-761): Push „Produkt X ist fertig“ (Ereignis, einmal je Produkt) und das nächste Produkt freischalten (Label `agent-ready` am Linear-Issue). */
async function freischalten(e: Entscheidung, name: string, schonGemeldet: boolean) {
  console.log(`${DRY ? "[trocken] " : ""}${fertigMeldung(name)}${e.freischalten ? `, schalte ${e.freischalten} frei (agent-ready)` : ""}`);
  if (DRY) return;
  if (!schonGemeldet) await supabase("loop_events", { project: e.produkt, agent: "ceo", step: FERTIG_SCHRITT, status: "ok", grund: fertigMeldung(name), issue: null, pr: null, run_id: null, run_url: null });
  if (!e.freischalten || !env.LINEAR_API_KEY) return void (e.freischalten && console.log("::warning::LINEAR_API_KEY fehlt, Freischalten übersprungen."));
  const linear = async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
    const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { "Content-Type": "application/json", Authorization: env.LINEAR_API_KEY ?? "" }, body: JSON.stringify({ query, variables }) });
    const json = (await res.json()) as { data?: T; errors?: unknown };
    if (!res.ok || json.errors) throw new Error(`Linear: ${res.status} ${JSON.stringify(json.errors ?? "")}`);
    return json.data as T;
  };
  const d = await linear<{ issue: { id: string; team: { labels: { nodes: { id: string; name: string }[] } }; labels: { nodes: { id: string }[] } } }>(`query($i: String!) { issue(id: $i) { id team { labels(first: 250) { nodes { id name } } } labels { nodes { id } } } }`, { i: e.freischalten });
  const label = d.issue.team.labels.nodes.find((l) => l.name === "agent-ready");
  if (!label) return console.log("::warning::Label agent-ready fehlt im Linear-Team.");
  if (d.issue.labels.nodes.some((l) => l.id === label.id)) return;
  await linear(`mutation($i: String!, $l: [String!]) { issueUpdate(id: $i, input: { labelIds: $l }) { success } }`, { i: d.issue.id, l: [...d.issue.labels.nodes.map((l) => l.id), label.id] });
}

async function main() {
  const jetzt = new Date();
  const snapshot: SnapshotRow[] = !env.SUPABASE_URL ? [] : parseSnapshot(await supabase("loop_snapshot?select=*&limit=200"));
  const events = !env.SUPABASE_URL ? [] : parseEvents(await supabase(`loop_events?select=*&created_at=gte.${new Date(jetzt.getTime() - 7 * TAG).toISOString()}&order=created_at.desc&limit=1000`));
  const letzte24 = events.filter((e) => Date.parse(e.created_at) >= jetzt.getTime() - TAG);
  const stand = new Map(fortschritt({ events: letzte24, snapshot }).map((f) => [f.project, f]));
  // Versionsstand (SIN-573): jüngstes VERSION-Ereignis je Produkt, ohne 7-Tage-Grenze, denn eine Version dauert länger.
  const versionen = !env.SUPABASE_URL ? [] : staende(await supabase("loop_events?select=project,step,status,grund,created_at&step=eq.VERSION&order=created_at.desc&limit=200"));
  const aufgaben = aufgabenFuerDich(snapshot);
  const wartend = wartendePrs(snapshot);

  // Alle Produkte mit Repo (SIN-572), nicht nur die mit Snapshot-Zeile. Ohne Zeile: warten, „keine Daten“.
  const lagen: ProduktLage[] = [];
  const ohne: Entscheidung[] = [];
  for (const p of PROJEKTE.filter((x) => x.repo)) {
    if (!snapshot.some((s) => s.project === p.id)) {
      ohne.push(ohneDaten(p.id, p.name));
      continue;
    }
    const ids = new Set(snapshot.filter((s) => s.project === p.id).map((s) => s.issue ?? `#${s.pr}`));
    lagen.push({
      id: p.id,
      name: p.name,
      startbar: startbar(snapshot, p.id),
      fertig: stand.get(p.id)?.fertig ?? null,
      gesamt: stand.get(p.id)?.gesamt ?? null,
      rot: rotVon(p.id, p.name, events),
      wartetAufSinan: [...aufgaben.filter((a) => ids.has(a.ref)).map((a) => `${a.ref} ${a.titel}`), ...wartend.filter((w) => REPOS[w.repo].projekt === p.id).map((w) => `PR #${w.nummer}`)],
      metaPrsHeute: await metaPrsHeute(p.repo, new Date(jetzt.getTime() - TAG)),
      ideenDieseWoche: events.filter((e) => e.project === p.id && /^idee$/i.test(e.step ?? "")).length,
      version: versionen.find((v) => v.produkt === p.id)?.status ?? null,
      fokusBei: projektName(fokusVon(versionen, p.id, jetzt)),
      bezug: bezugVon(snapshot, p.id),
    });
  }

  const tag = jetzt.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  // Der Satz entsteht bei jedem Lauf (SIN-579), auch wenn nichts zu planen ist: so verfällt er nach jedem Merge, nicht erst am nächsten Morgen.
  for (const e of [...ohne, ...lagen.map(entscheide)]) {
    console.log(`${gedaechtnisZeile(e, tag)} (Auslöser: ${ausloeser}, Meta: ${e.metaErlaubt ? "ja" : "nein"}, Ideen: ${e.ideenErlaubt ? "ja" : "nein"})`);
    if (DRY) continue;
    const run = env.GITHUB_RUN_ID;
    await supabase("ceo_entscheidungen", entscheidungsZeile(e, ausloeser, null));
    await supabase("loop_events", ereignisZeile(e.produkt, run ?? null, run ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${run}` : null));
  }
  for (const e of lagen.map(entscheide)) {
    if (e.art === "fertig") await freischalten(e, projektName(e.produkt) ?? e.produkt, events.some((v) => v.project === e.produkt && v.step === FERTIG_SCHRITT));
    if (e.visionaer) await visionaerRufen(e.produkt);
  }
  if (DRY) console.log("Trockenlauf: nichts geschrieben.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
