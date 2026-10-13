/**
 * CEO-Agent (SIN-542). Aufruf aus ceo.yml (Vorlage: docs/ceo/ceo.yml.vorlage):
 *
 *   CEO_AUSLOESER=vorrat|bereitschaft|rot|taeglich npx tsx scripts/ceo/ceo.ts
 *
 * Liest loop_snapshot und loop_events (Supabase) und GitHub (gemergte Meta-PRs), entscheidet je Produkt genau eine Sache
 * (src/lib/ceo/ceo.ts) und schreibt eine Zeile in `ceo_entscheidungen` sowie ein Ereignis `rolle_gestartet` in `loop_events`.
 * Kein KI-Aufruf. Kein Geld, keine DB-Änderung, keine Freigabe.
 *
 * Env: GH_TOKEN (AGENT_WORKFLOW_TOKEN), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CEO_AUSLOESER, CEO_ROT (optional: "produkt=Grund;…" aus Live-Check/Sentry).
 * DRY_RUN=1 oder fehlende Supabase-Variablen: nur Ausgabe im Log, nichts geschrieben.
 */
import { AUSLOESER, ereignisZeile, entscheide, entscheidungsZeile, gedaechtnisZeile, startbar, type Ausloeser, type Entscheidung, type ProduktLage } from "../../src/lib/ceo/ceo";
import { REPOS } from "../../src/lib/freigabe";
import { alleProjekte } from "../../src/lib/projekte";
import { parseEvents, parseSnapshot, type LoopEvent, type SnapshotRow } from "../../src/lib/uebersicht";
import { fortschritt } from "../../src/lib/uebersicht-einfach";
import { aufgabenFuerDich } from "../../src/lib/uebersicht-b1";
import { wartendePrs } from "../../src/lib/wartende-prs";

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

async function main() {
  const jetzt = new Date();
  const snapshot: SnapshotRow[] = !env.SUPABASE_URL ? [] : parseSnapshot(await supabase("loop_snapshot?select=*&limit=200"));
  const events = !env.SUPABASE_URL ? [] : parseEvents(await supabase(`loop_events?select=*&created_at=gte.${new Date(jetzt.getTime() - 7 * TAG).toISOString()}&order=created_at.desc&limit=1000`));
  const letzte24 = events.filter((e) => Date.parse(e.created_at) >= jetzt.getTime() - TAG);
  const stand = new Map(fortschritt({ events: letzte24, snapshot }).map((f) => [f.project, f]));
  const aufgaben = aufgabenFuerDich(snapshot);
  const wartend = wartendePrs(snapshot);

  const lagen: ProduktLage[] = [];
  for (const p of alleProjekte(snapshot.map((s) => s.project))) {
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
    });
  }

  const tag = jetzt.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  // Nach einem Merge oder einer Änderung der Bereitschaftsliste schreibt der CEO nur, wenn er etwas zu planen hat; täglich und bei Rot immer.
  const schreibenSoll = (e: Entscheidung) => ausloeser === "taeglich" || ausloeser === "rot" || e.auffuellen > 0 || e.art !== "weiterbauen";
  for (const lage of lagen) {
    const e = entscheide(lage);
    if (!schreibenSoll(e)) continue;
    console.log(`${gedaechtnisZeile(e, tag)} (Auslöser: ${ausloeser}, auffüllen: ${e.auffuellen}, Meta: ${e.metaErlaubt ? "ja" : "nein"}, Ideen: ${e.ideenErlaubt ? "ja" : "nein"})`);
    if (DRY) continue;
    const run = env.GITHUB_RUN_ID;
    await supabase("ceo_entscheidungen", entscheidungsZeile(e, ausloeser, null));
    await supabase("loop_events", ereignisZeile(e.produkt, run ?? null, run ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${run}` : null));
  }
  if (DRY) console.log("Trockenlauf: nichts geschrieben.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
