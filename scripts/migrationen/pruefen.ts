/**
 * Migrations-Prüfung (SIN-592). Aufruf (Vorlage: docs/autonomy/migrationen.yml.vorlage):
 *
 *   npx tsx scripts/migrationen/pruefen.ts
 *
 * Liest supabase/migrations/leitstand/*.sql, leitet Tabellen, Spalten und Realtime-Tabellen ab (src/lib/migrationen) und
 * vergleicht sie mit der Datenbank. Je fehlender Datei ein `loop_events`-Eintrag (Schritt migration, Status fehlt, issue
 * „Datei: Grund“), der unter „Braucht dich“ und als Push-Alarm erscheint. Ist die Datei danach eingespielt, folgt Status ok.
 * Es wird nichts eingespielt und nur gelesen (select).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (loop_events), SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN
 * (Management-API, einzige Stelle, an der `information_schema` und `pg_publication_tables` lesbar sind; wie scripts/stand).
 * DRY_RUN=1: nur anzeigen, was erwartet wird; Datenbank wird nur gelesen, wenn die Zugangsdaten da sind, nie geschrieben.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dateiAus, ereignisIssue, erwartungen, fehlendes, jeDatei, type Ist } from "../../src/lib/migrationen/migrationen";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const ORDNER = "supabase/migrations/leitstand";
const supabaseKopf = () => ({ apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? "", Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` });

async function istStand(): Promise<Ist> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query:
        "select 'spalte' as art, table_name as tabelle, column_name as spalte from information_schema.columns where table_schema = 'public' " +
        "union all select 'realtime', tablename, null from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'",
    }),
  });
  if (!res.ok) throw new Error(`Management-API: ${res.status}`);
  const zeilen = (await res.json()) as { art: string; tabelle: string; spalte: string | null }[];
  const spalten = new Map<string, Set<string>>();
  const realtime = new Set<string>();
  for (const z of zeilen) {
    if (z.art === "realtime") realtime.add(z.tabelle);
    else spalten.set(z.tabelle, (spalten.get(z.tabelle) ?? new Set()).add(z.spalte!));
  }
  return { spalten, realtime };
}

async function schreibe(zeilen: object[]) {
  if (!zeilen.length) return;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events`, {
    method: "POST",
    headers: { ...supabaseKopf(), "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(zeilen),
  });
  if (!res.ok) throw new Error(`loop_events nicht geschrieben: ${res.status} ${await res.text()}`);
}

async function main() {
  const dateien = readdirSync(ORDNER).filter((d) => d.endsWith(".sql")).sort();
  const erwartet = dateien.flatMap((d) => erwartungen(d, readFileSync(`${ORDNER}/${d}`, "utf8")));
  console.log(`${dateien.length} Migrationen, ${erwartet.length} erwartete Objekte`);

  if (!env.SUPABASE_PROJECT_REF || !env.SUPABASE_ACCESS_TOKEN || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    if (DRY) return console.log("[trocken] Zugangsdaten fehlen: Datenbank nicht gelesen.");
    throw new Error("SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN, SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt");
  }

  const fehlt = jeDatei(fehlendes(erwartet, await istStand()));
  for (const f of fehlt) console.log(`${DRY ? "[trocken] " : ""}fehlt: ${f.datei}: ${f.grund}`);
  if (!fehlt.length) console.log("Alle Migrationen sind in der Datenbank angekommen.");

  // Jüngster Stand je Datei der letzten 24 h: war sie `fehlt` und ist jetzt da, folgt `ok`.
  const ab = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events?select=created_at,status,issue&step=eq.migration&created_at=gte.${ab}&order=created_at.desc&limit=500`, { headers: supabaseKopf() });
  if (!res.ok) throw new Error(`loop_events nicht lesbar: ${res.status}`);
  const bisher = (await res.json()) as { status: string; issue: string }[];
  const war = new Set<string>();
  const gesehen = new Set<string>();
  for (const e of bisher) {
    const d = dateiAus(e.issue);
    if (gesehen.has(d)) continue;
    gesehen.add(d);
    if (e.status === "fehlt") war.add(d);
  }

  const lauf = env.GITHUB_RUN_ID ?? null;
  const url = lauf ? `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${env.GITHUB_REPOSITORY ?? "siinanXD/Leitstand"}/actions/runs/${lauf}` : null;
  const zeile = (status: string, issue: string) => ({ project: "leitstand", agent: "betrieb", step: "migration", status, issue, pr: null, run_id: lauf, run_url: url });
  // shortcut: `fehlt` wird bei jedem Lauf neu geschrieben (die Übersicht liest nur 24 h); ausbauen, wenn die Tabelle wächst.
  const ok = [...war].filter((d) => !fehlt.some((f) => f.datei === d)).map((d) => zeile("ok", `${d}: eingespielt`));
  if (DRY) return console.log(`[trocken] würde schreiben: ${fehlt.length} fehlt, ${ok.length} ok`);
  await schreibe([...fehlt.map((f) => zeile("fehlt", ereignisIssue(f))), ...ok]);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
