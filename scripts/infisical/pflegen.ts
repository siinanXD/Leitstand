/**
 * Infisical pflegt sich selbst (SIN-1051). Aufruf (.github/workflows/infisical-pflegen.yml):
 *
 *   npx tsx scripts/infisical/pflegen.ts
 *
 * Gleicht die Soll-Liste (docs/autonomy/produkte.json) mit Infisical ab, legt fehlende Ordner und Variablen mit LEEREM Wert an
 * (nie Werte setzen, überschreiben oder löschen) und legt je leerem Wert eine `sinan`-Aufgabe in Linear an, die sich schließt, sobald
 * der Wert gefüllt ist. Werte werden nie gespeichert oder geloggt.
 *
 * Env: INFISICAL_IDENTITY_ID (lesen), INFISICAL_SCHREIB_IDENTITY_ID (nur Anlegen; fehlt sie, gibt es eine einzige `sinan`-Aufgabe),
 *      INFISICAL_PROJEKT_ID, LINEAR_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GitHub-OIDC (id-token: write).
 * DRY_RUN=1: nur lesen und anzeigen; ohne Zugang wird gegen einen leeren Ist-Zustand gerechnet. Es wird nichts angelegt oder geschrieben.
 */
import { readFileSync } from "node:fs";
import { abgeschlossene, erinnerungen, gleicheAb, plane, type Befund, type Ist } from "../../src/lib/infisical/abgleich";
import { InfisicalFehler, ladeIst, legeAn, type Verbindung } from "../../src/lib/infisical/client";
import { pruefeRegister, type Produkt } from "../../src/lib/kontingent/produkte";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const BASIS = "https://eu.infisical.com";
const RECHTE_TITEL = "Infisical: Schreibrecht zum Anlegen von Ordnern und Variablen einrichten";

/** Zugangstoken über GitHub-OIDC für eine Infisical-Identität; null, wenn Identität oder OIDC fehlen. */
async function anmelden(identityId: string | undefined): Promise<string | null> {
  if (!identityId || !env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) return null;
  const oidc = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  oidc.searchParams.set("audience", "https://github.com/siinanXD");
  const jwt = ((await (await fetch(oidc, { headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` } })).json()) as { value?: string }).value;
  if (!jwt) throw new Error("GitHub-OIDC-Token fehlt");
  const res = await fetch(`${BASIS}/api/v1/auth/oidc-auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identityId, jwt }) });
  if (!res.ok) throw new Error(`Infisical-Anmeldung: HTTP ${res.status}`);
  return ((await res.json()) as { accessToken?: string }).accessToken ?? null;
}

async function linear<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { Authorization: env.LINEAR_API_KEY!, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(20_000) });
  const d = (await res.json()) as { data?: T; errors?: unknown };
  if (!res.ok || d.errors || !d.data) throw new Error(`Linear: HTTP ${res.status}${d.errors ? " (Fehler in der Antwort)" : ""}`);
  return d.data;
}

type Team = { id: string; states: { nodes: { id: string; type: string }[] }; labels: { nodes: { id: string; name: string }[] } };
type Offen = { id: string; title: string };

/** Legt fehlende `sinan`-Aufgaben an und schließt Erinnerungen, deren Wert gefüllt ist. Ohne LINEAR_API_KEY nur Ausgabe. */
async function abgleichLinear(soll: { titel: string; beschreibung: string }[]) {
  if (DRY || !env.LINEAR_API_KEY) {
    for (const e of soll) console.log(`${DRY ? "[trocken] " : ""}sinan-Aufgabe: ${e.titel}`);
    if (!DRY) console.log("::warning::LINEAR_API_KEY fehlt: Erinnerungen nur im Log.");
    return;
  }
  const d = await linear<{ teams: { nodes: Team[] }; issues: { nodes: Offen[] } }>(
    `query { teams(first: 1) { nodes { id states { nodes { id type } } labels(first: 250) { nodes { id name } } } }
      issues(first: 250, filter: { labels: { name: { eqIgnoreCase: "sinan" } }, state: { type: { nin: ["completed", "canceled"] } } }) { nodes { id title } } }`,
  );
  const team = d.teams.nodes[0];
  const label = team.labels.nodes.find((l) => l.name.toLowerCase() === "sinan");
  const offen = new Set(d.issues.nodes.map((i) => i.title));
  for (const e of soll.filter((x) => !offen.has(x.titel)))
    await linear(`mutation($i: IssueCreateInput!) { issueCreate(input: $i) { success } }`, { i: { teamId: team.id, title: e.titel, description: e.beschreibung, labelIds: label ? [label.id] : [] } });
  const fertig = team.states.nodes.find((s) => s.type === "completed");
  const zu = new Set(abgeschlossene(d.issues.nodes.map((i) => i.title), soll));
  if (fertig) for (const i of d.issues.nodes.filter((x) => zu.has(x.title))) await linear(`mutation($id: String!, $s: String!) { issueUpdate(id: $id, input: { stateId: $s }) { success } }`, { id: i.id, s: fertig.id });
}

async function ereignis(status: "ok" | "fehler", grund: string) {
  if (DRY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : null;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ project: "leitstand", step: "infisical-pflegen", status, grund, issue: null, pr: null, run_id: env.GITHUB_RUN_ID ?? null, run_url: runUrl }),
  });
  if (!res.ok) console.log(`::warning::loop_event nicht geschrieben: ${res.status}`);
}

const zaehle = (b: Befund[]) => Object.entries(Object.groupBy(b, (x) => x.art)).map(([a, l]) => `${a}: ${l?.length}`).join(", ") || "alles in Ordnung";

async function main() {
  const produkte = (JSON.parse(readFileSync("docs/autonomy/produkte.json", "utf8")) as { produkte: Produkt[] }).produkte;
  const fehler = pruefeRegister(produkte);
  if (fehler.length) throw new Error(`Register fehlerhaft: ${fehler.join("; ")}`);

  const projektId = env.INFISICAL_PROJEKT_ID;
  const token = projektId ? await anmelden(env.INFISICAL_IDENTITY_ID) : null;
  let ist: Ist = { ordner: [], variablen: [] };
  let verbindung: Verbindung | null = null;
  if (token && projektId) {
    verbindung = { fetch, token, projektId };
    const ziele = produkte.flatMap((p) => [...new Set(p.secrets.map((s) => s.environment))].map((environment) => ({ environment, pfad: p.infisicalOrdner })));
    ist = await ladeIst(verbindung, ziele);
  } else {
    console.log(`::warning::${DRY ? "Trockenlauf ohne Infisical-Zugang" : "Infisical nicht lesbar"}: gerechnet wird gegen einen leeren Ist-Zustand.`);
    if (!DRY) throw new Error("Infisical-Zugang fehlt (INFISICAL_PROJEKT_ID, INFISICAL_IDENTITY_ID, OIDC)");
  }

  const befunde = gleicheAb(produkte, ist);
  const aktionen = plane(befunde);
  console.log(`${DRY ? "[trocken] " : ""}Befunde: ${zaehle(befunde)}`);
  for (const b of befunde.filter((x) => x.art === "unbekannt_in_infisical")) console.log(`Unbekannt in Infisical (nur gemeldet): ${b.produkt} ${"name" in b ? b.name : ""}`);

  let rechteFehlen = false;
  if (aktionen.length && !DRY) {
    const schreib = await anmelden(env.INFISICAL_SCHREIB_IDENTITY_ID).catch(() => null);
    if (!schreib || !projektId) rechteFehlen = true;
    else {
      try {
        for (const a of aktionen) console.log(`${await legeAn({ fetch, token: schreib, projektId }, a)}: ${a.art} ${a.pfad}${"name" in a ? ` ${a.name}` : ""}`);
      } catch (e) {
        if (!(e instanceof InfisicalFehler) || (e.status !== 401 && e.status !== 403)) throw e;
        rechteFehlen = true;
      }
    }
  } else for (const a of aktionen) console.log(`[trocken] würde anlegen: ${a.art} ${a.pfad}${"name" in a ? ` ${a.name}` : ""}`);

  const sinan = erinnerungen(befunde, produkte, `https://eu.infisical.com/organizations/-/projects/secret-management/${projektId ?? "-"}/overview`);
  if (rechteFehlen)
    sinan.push({
      titel: RECHTE_TITEL,
      beschreibung: `Der Leitstand kann fehlende Ordner und Variablen nicht selbst anlegen (${aktionen.length} offen).\n\n1. Infisical → Access Control → Machine Identities: neue Identität mit GitHub-OIDC-Anmeldung für siinanXD/Leitstand anlegen.\n2. Rolle nur mit Rechten zum Anlegen von Ordnern und Variablen, kein Lesen von Werten.\n3. GitHub → Leitstand → Settings → Variables: INFISICAL_SCHREIB_IDENTITY_ID mit der Kennung der Identität setzen.\n\nBis dahin laufen Abgleich und Erinnerung weiter.`,
    });
  await abgleichLinear(sinan);
  await ereignis("ok", `${zaehle(befunde)}${rechteFehlen ? "; Schreibrecht fehlt" : ""}`);
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await ereignis("fehler", e instanceof Error ? e.message.slice(0, 200) : "Fehler").catch(() => undefined);
  process.exit(1);
});
