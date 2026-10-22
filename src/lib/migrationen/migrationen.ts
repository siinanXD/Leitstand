// Migrationen auf main ↔ Datenbank (SIN-592). Rein: SQL-Text und Ist-Stand kommen von außen.
// Anlass: Eine Migration auf main ist nicht automatisch in Supabase eingespielt; der CEO-Lauf brach stundenlang ab (Spalte fehlte).

export type Erwartung =
  | { art: "tabelle"; datei: string; tabelle: string }
  | { art: "spalte"; datei: string; tabelle: string; spalte: string }
  | { art: "publikation"; datei: string; tabelle: string };

/** Ist-Stand: Spalten je Tabelle (Schema public) und Tabellen in der Publikation `supabase_realtime`. */
export type Ist = { spalten: ReadonlyMap<string, ReadonlySet<string>>; realtime: ReadonlySet<string> };
export type Fehlt = { datei: string; grund: string };

const NAME = String.raw`(?:public\.)?"?([a-z_][a-z0-9_]*)"?`;
const ohneKommentare = (sql: string) => sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Liest `create table`, `add column` und `alter publication … add table` aus einer Migration.
 * shortcut: Nur diese drei Formen (keine Typen, Indizes, Policies, Umbenennungen), ausbauen, sobald eine Migration anderes braucht.
 * Realtime in `do $$`-Blöcken mit `format(… %I)` liest die Tabellen aus dem `array['a', 'b']` im selben Block.
 */
export function erwartungen(datei: string, sql: string): Erwartung[] {
  const text = ohneKommentare(sql).toLowerCase();
  const out: Erwartung[] = [];
  for (const m of text.matchAll(new RegExp(String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?${NAME}`, "g"))) out.push({ art: "tabelle", datei, tabelle: m[1] });
  for (const anweisung of text.split(";")) {
    const alter = new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${NAME}`).exec(anweisung);
    if (alter) for (const m of anweisung.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/g)) out.push({ art: "spalte", datei, tabelle: alter[1], spalte: m[1] });
  }
  for (const block of text.split(/\bdo\s+\$\$/)) {
    if (!/alter\s+publication\s+supabase_realtime\s+add\s+table/.test(block)) continue;
    // `add table public.%I` (format) liest NAME als „public“; das ist keine Tabelle.
    const literal = [...block.matchAll(new RegExp(String.raw`add\s+table\s+${NAME}`, "g"))].map((m) => m[1]).filter((t) => t !== "public");
    const liste = [...(/array\s*\[([^\]]*)\]\s*loop/.exec(block)?.[1] ?? "").matchAll(/'([a-z_][a-z0-9_]*)'/g)].map((m) => m[1]);
    for (const tabelle of new Set([...literal, ...liste])) out.push({ art: "publikation", datei, tabelle });
  }
  return out;
}

/**
 * Fehlendes je Datei. Spalte und Publikation prüfen nur Tabellen, die es gibt: die Migrationen überspringen
 * fehlende Tabellen selbst (`if exists`, `to_regclass`). Fehlt die Tabelle ganz, meldet es ihre `create table`-Datei.
 */
export function fehlendes(erwartet: readonly Erwartung[], ist: Ist): Fehlt[] {
  const out: Fehlt[] = [];
  for (const e of erwartet) {
    const spalten = ist.spalten.get(e.tabelle);
    if (e.art === "tabelle") {
      if (!spalten) out.push({ datei: e.datei, grund: `Tabelle ${e.tabelle} fehlt` });
    } else if (spalten) {
      if (e.art === "spalte" && !spalten.has(e.spalte)) out.push({ datei: e.datei, grund: `Spalte ${e.tabelle}.${e.spalte} fehlt` });
      if (e.art === "publikation" && !ist.realtime.has(e.tabelle)) out.push({ datei: e.datei, grund: `${e.tabelle} fehlt in der Realtime-Publikation` });
    }
  }
  return out;
}

/** Eine Zeile je Datei, Gründe zusammengefasst. */
export function jeDatei(f: readonly Fehlt[]): Fehlt[] {
  const map = new Map<string, string[]>();
  for (const { datei, grund } of f) map.set(datei, [...(map.get(datei) ?? []), grund]);
  return [...map].map(([datei, gruende]) => ({ datei, grund: gruende.join("; ") }));
}

/** `loop_events.issue` trägt „Datei: Grund“ (Dateinamen haben keinen Doppelpunkt). */
export const ereignisIssue = (f: Fehlt) => `${f.datei}: ${f.grund}`;
export const dateiAus = (issue: string) => issue.split(": ")[0];

type Zeile = { created_at: string; step: string | null; status: string | null; issue: string | null };
export type Offen = { datei: string; grund: string; zeit: number };

/** Offen = jüngstes Ereignis der Datei ist `fehlt`; `zeit` ist dessen Zeitpunkt (ms). */
export function offene(events: readonly Zeile[]): Offen[] {
  const neuste = new Map<string, Zeile>();
  for (const e of events) {
    if (e.step !== "migration" || !e.issue) continue;
    const datei = dateiAus(e.issue);
    const alt = neuste.get(datei);
    if (!alt || Date.parse(e.created_at) > Date.parse(alt.created_at)) neuste.set(datei, e);
  }
  return [...neuste].filter(([, e]) => e.status === "fehlt").map(([datei, e]) => ({ datei, grund: e.issue!.slice(datei.length + 2), zeit: Date.parse(e.created_at) }));
}
