/**
 * Architekt (SIN-1034). Aufruf aus architekt.yml (.github/workflows/architekt.yml):
 *
 *   npx tsx scripts/architekt/architekt.ts <produkt> [datei]
 *
 * Ohne <datei> bewertet das Skript jede Seite aus e2e/routes.ts regelbasiert (src/lib/architekt). Mit <datei> (Ausgabe der Rolle nach
 * docs/schemas/architekt.json) prüft es Schema und Belege und glaubt dem Agenten kein unbelegtes `entfernen`.
 * Die Urteile gehen ins Log und, ohne DRY_RUN, als Ereignis `architekt` in loop_events.
 *
 * Seitenaufrufe: PostHog (POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID, POSTHOG_HOST). Fehlen sie oder scheitert die Abfrage, steht
 * „keine Daten“ im Urteil, nichts wird geschätzt.
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. DRY_RUN=1 oder fehlende Variablen: nur Ausgabe im Log, kein Schreibzugriff.
 */
import { readFile } from "node:fs/promises";
import { ROUTEN } from "../../e2e/routes";
import { bewerteSeite, inFertigListe, pruefeUrteile, SCHRITT, TAGE, type Seite, type SeitenUrteil } from "../../src/lib/architekt/architekt";
import { pruefeSchema, type Schema } from "../../src/lib/autonomy/schema";

const env = process.env;
const DRY = env.DRY_RUN === "1" || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY;
const [produkt, datei] = process.argv.slice(2);

/** Aufrufe je Pfad der letzten 30 Tage; undefined, wenn PostHog fehlt oder nicht antwortet. */
async function aufrufe(): Promise<Map<string, number> | undefined> {
  const { POSTHOG_PERSONAL_API_KEY: key, POSTHOG_PROJECT_ID: id, POSTHOG_HOST: host } = env;
  if (!key || !id || !host) return undefined;
  try {
    const query = `SELECT properties.$pathname AS pfad, count() AS n FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL ${TAGE} DAY GROUP BY pfad`;
    const res = await fetch(`${host}/api/projects/${id}/query/`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: { kind: "HogQLQuery", query } }) });
    if (!res.ok) return undefined;
    const { results } = (await res.json()) as { results: [string, number][] };
    return new Map(results.map(([pfad, n]) => [pfad, n]));
  } catch {
    return undefined;
  }
}

/** Dynamische Seiten (/projekt/leitstand) zählen alle Aufrufe unter ihrem ersten Pfadteil. */
function zaehle(zahlen: Map<string, number> | undefined, pfad: string): number | undefined {
  if (!zahlen) return undefined;
  const wurzel = pfad.split("/").slice(0, 2).join("/");
  const dynamisch = ROUTEN.some((r) => r.pfad === pfad && r.datei.includes("["));
  return [...zahlen].reduce((summe, [p, n]) => (p === pfad || (dynamisch && p.startsWith(`${wurzel}/`)) ? summe + n : summe), 0);
}

async function main() {
  if (!produkt || !/^[a-z]+$/.test(produkt)) throw new Error("Aufruf: npx tsx scripts/architekt/architekt.ts <produkt> [datei]");
  if (produkt !== "leitstand") throw new Error(`${produkt}: Routenliste nur für leitstand (e2e/routes.ts)`);
  const fertig = await readFile("docs/FERTIG.md", "utf8");
  const zahlen = await aufrufe();
  const seiten: Seite[] = ROUTEN.filter((r) => !r.ausnahme).map((r) => ({ pfad: r.pfad, aufrufe: zaehle(zahlen, r.pfad), inFertigListe: inFertigListe(r.pfad, fertig) }));

  let urteile: SeitenUrteil[] = seiten.map(bewerteSeite);
  if (datei) {
    const ergebnis = JSON.parse(await readFile(datei, "utf8")) as { produkt: string; urteile: SeitenUrteil[] };
    const fehler = [...pruefeSchema(ergebnis, JSON.parse(await readFile("docs/schemas/architekt.json", "utf8")) as Schema)];
    if (!fehler.length) fehler.push(...pruefeUrteile(ergebnis.urteile, seiten));
    if (ergebnis.produkt !== produkt) fehler.push(`produkt: ${ergebnis.produkt} statt ${produkt}`);
    if (fehler.length) throw new Error(`Ausgabe abgelehnt:\n- ${fehler.join("\n- ")}`);
    urteile = ergebnis.urteile;
  }

  console.log(`${DRY ? "[trocken] " : ""}${produkt}: ${urteile.length} Urteile${zahlen ? "" : ", Analytics fehlen"}`);
  for (const u of urteile) console.log(`${u.urteil.padEnd(13)} ${u.pfad}${u.mit ? ` → ${u.mit}` : ""} · ${u.grund} (${u.beleg})`);
  if (DRY) return;
  const gezaehlt = urteile.filter((u) => u.urteil !== "behalten").length;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ project: produkt, agent: SCHRITT, step: SCHRITT, status: "ok", grund: `${urteile.length} Seiten bewertet, ${gezaehlt} mit Handlungsbedarf` }),
  });
  if (!res.ok) throw new Error(`Supabase loop_events: ${res.status}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
