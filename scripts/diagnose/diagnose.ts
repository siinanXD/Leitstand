/**
 * Diagnose-Agent (SIN-907). Aufruf aus diagnose.yml (.github/workflows/diagnose.yml), zwei Schritte um den Agenten-Lauf herum:
 *
 *   npx tsx scripts/diagnose/diagnose.ts ziel        # wählt ein Ziel, schreibt diagnose-ziel.json und diagnose-daten.json, setzt Ausgabe `ziel=ja|nein`
 *   npx tsx scripts/diagnose/diagnose.ts auswerten   # prüft diagnose-ergebnis.json, kommentiert in Linear, schreibt loop_event (Schritt `diagnose`)
 *
 * Der Agent ist nur lesend (docs/skills/diagnose/SKILL.md) und bekommt keinen Supabase-Schlüssel: die lesbaren Tabellen
 * (loop_events, loop_snapshot, leitstand_aufgaben) legt dieses Skript als diagnose-daten.json vor. Linear-Kommentar und Ereignis
 * schreibt ebenfalls dieses Skript, nie der Agent. Es ändert nie einen Linear-Status.
 * Für Workflow-Ziele gibt es keinen Linear-Kommentar; das Ergebnis steht im loop_event und im Job-Log.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LINEAR_API_KEY (Kommentar), DIAGNOSE_WORKFLOW + DIAGNOSE_RUN_URL (roter Workflow,
 * aus `workflow_run`), DRY_RUN=1 (nichts schreiben).
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { issueAusloeser, kommentar, pruefeDiagnose, SCHRITT, workflowAusloeser, type Diagnose, type Ereignis, type Ziel } from "../../src/lib/diagnose/diagnose";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const ZIEL = "diagnose-ziel.json";
const DATEN = "diagnose-daten.json";
const ERGEBNIS = "diagnose-ergebnis.json";
/** Festgelegte Tabellen für die lesende SQL des Agenten (SIN-907): nur diese, nur diese Spalten, begrenzt. */
const TABELLEN = ["loop_events?order=created_at.desc&limit=2000", "loop_snapshot?limit=50", "leitstand_aufgaben?limit=200"];

const supabase = (pfad: string, init: RequestInit = {}) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt");
  return fetch(`${env.SUPABASE_URL}/rest/v1/${pfad}`, {
    ...init,
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
};

async function lesen<T>(pfad: string): Promise<T> {
  const res = await supabase(pfad);
  if (!res.ok) throw new Error(`${pfad.split("?")[0]} lesen: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function linear<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  if (!env.LINEAR_API_KEY) throw new Error("LINEAR_API_KEY fehlt");
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: env.LINEAR_API_KEY },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (!res.ok || j.errors || !j.data) throw new Error(`Linear: ${j.errors?.map((e) => e.message).join("; ") ?? res.status}`);
  return j.data;
}

async function linearKommentar(identifier: string, body: string): Promise<void> {
  const { issue } = await linear<{ issue: { id: string } }>("query($id: String!) { issue(id: $id) { id } }", { id: identifier });
  const { commentCreate } = await linear<{ commentCreate: { success: boolean } }>(
    "mutation($issueId: String!, $body: String!) { commentCreate(input: { issueId: $issueId, body: $body }) { success } }",
    { issueId: issue.id, body },
  );
  if (!commentCreate.success) throw new Error(`Linear Kommentar an ${identifier} nicht angelegt`);
}

async function ziel(): Promise<void> {
  const jetzt = new Date();
  const events = await lesen<Ereignis[]>(`loop_events?select=created_at,step,status,issue,pr,grund,run_url&created_at=gte.${new Date(jetzt.getTime() - 48 * 3_600_000).toISOString()}&order=created_at.desc&limit=2000`);
  const kandidaten: Ziel[] = env.DIAGNOSE_WORKFLOW
    ? [workflowAusloeser(env.DIAGNOSE_WORKFLOW, env.DIAGNOSE_RUN_URL ?? "", events, jetzt)].filter((z): z is Ziel => !!z)
    : issueAusloeser(events, jetzt);
  // Ein Ziel je Lauf hält das Kontingent klein; die übrigen folgen im nächsten Lauf.
  const z = kandidaten[0];
  if (z) {
    writeFileSync(ZIEL, JSON.stringify(z, null, 2));
    writeFileSync(DATEN, JSON.stringify(Object.fromEntries(await Promise.all(TABELLEN.map(async (t) => [t.split("?")[0], await lesen<unknown>(t)]))), null, 2));
  }
  console.log(z ? `Ziel: ${z.schluessel} (${kandidaten.length} Kandidaten)` : "Kein Ziel, keine Diagnose nötig.");
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `ziel=${z ? "ja" : "nein"}\n`);
}

async function auswerten(): Promise<void> {
  if (!existsSync(ERGEBNIS) || !existsSync(ZIEL)) throw new Error(`${ERGEBNIS} oder ${ZIEL} fehlt, der Agent hat nichts geliefert`);
  const z = JSON.parse(readFileSync(ZIEL, "utf8")) as Ziel;
  const roh: unknown = JSON.parse(readFileSync(ERGEBNIS, "utf8"));
  const fehler = pruefeDiagnose(roh);
  if (fehler.length) throw new Error(`Diagnose ungültig: ${fehler.join("; ")}`);
  const d = roh as Diagnose;
  if (d.ziel !== z.schluessel) throw new Error(`Diagnose gehört zu ${d.ziel}, nicht zu ${z.schluessel}`);
  const text = kommentar(d);
  console.log(text);
  if (DRY) return;
  if (z.issue) await linearKommentar(z.issue, text);
  // Auch für Workflow-Ziele: das Ereignis schaltet die 6-h-Sperre und zeigt die Ursache im Leitstand.
  const res = await supabase("loop_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      project: "leitstand",
      step: SCHRITT,
      status: "ok",
      issue: z.issue ?? null,
      grund: `${z.schluessel}: art=${d.art}: ${d.ursache}`.slice(0, 500),
      run_id: env.GITHUB_RUN_ID ?? null,
      run_url: env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : null,
    }),
  });
  if (!res.ok) throw new Error(`loop_event schreiben: ${res.status} ${await res.text()}`);
}

const modus = process.argv[2];
(modus === "ziel" ? ziel() : modus === "auswerten" ? auswerten() : Promise.reject(new Error("Aufruf: diagnose.ts ziel|auswerten"))).catch((e: Error) => {
  console.error(`::error::${e.message}`);
  process.exit(1);
});
