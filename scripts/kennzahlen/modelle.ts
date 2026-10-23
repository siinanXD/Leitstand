/**
 * Modell-Messung je Rolle (SIN-942). Aufruf: npx tsx scripts/kennzahlen/modelle.ts
 * Liest loop_events der letzten 7 Tage und die Durchstich-Zeile aus loop_snapshot (leitstand), rechnet src/lib/kennzahlen/modelle.ts,
 * schreibt das Ergebnis nach loop_snapshot.modelle und je Messgröße einen Langfuse-Score (feste id, daher idempotent).
 * Der Wächter ruft es stündlich auf; wegen der festen ids ändert sich pro Woche je Rolle, Modell und Größe nur der Wert.
 * DRY_RUN=1: nur Ausgabe. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL (ohne sie nur Warnung).
 */
import { messeRollen, type MessEreignis } from "../../src/lib/kennzahlen/modelle";

const env = process.env;
const DRY = env.DRY_RUN === "1";

async function supabase(pfad: string, init?: RequestInit): Promise<unknown> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt");
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${pfad}`, {
    ...init,
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates", ...init?.headers },
  });
  if (!res.ok) throw new Error(`Supabase ${pfad.split("?")[0]}: ${res.status} ${await res.text()}`);
  return init?.method === "POST" || init?.method === "PATCH" ? null : res.json();
}

/** Montag (UTC) der laufenden Woche als JJJJ-MM-TT. */
function wochenStart(jetzt: Date): string {
  const d = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

async function main() {
  const jetzt = new Date();
  const ab = new Date(jetzt.getTime() - 7 * 86_400_000).toISOString();
  const events = (await supabase(`loop_events?project=eq.leitstand&created_at=gte.${ab}&select=created_at,step,agent,status,issue,pr,cost&limit=5000`)) as MessEreignis[];
  const zeile = ((await supabase("loop_snapshot?project=eq.leitstand&select=durchstich,mit_eingriff")) as { durchstich?: { liste?: string[] } | null; mit_eingriff?: { kennung: string }[] | null }[])[0];
  // shortcut: Durchstich kommt aus dem Tageswert (48 h) von durchstich.ts, nicht aus 7 Tagen; ausbauen, wenn die Quote je Woche schwankt.
  const messungen = messeRollen(events, { durchstich: zeile?.durchstich?.liste ?? [], mitEingriff: (zeile?.mit_eingriff ?? []).map((e) => e.kennung) });
  const woche = wochenStart(jetzt);
  const nutzlast = { stand: woche, messungen };
  console.log(JSON.stringify(nutzlast, null, 2));
  if (DRY) return;
  await supabase("loop_snapshot?on_conflict=project", { method: "POST", body: JSON.stringify({ project: "leitstand", modelle: nutzlast }) });

  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY || !env.LANGFUSE_BASE_URL) {
    console.warn("Langfuse-Zugang fehlt: Scores werden nicht geschrieben.");
    return;
  }
  const auth = `Basic ${Buffer.from(`${env.LANGFUSE_PUBLIC_KEY}:${env.LANGFUSE_SECRET_KEY}`).toString("base64")}`;
  const werte = (m: (typeof messungen)[number]) => ({ durchstich_quote: m.durchstichQuote, pruefer_runden: m.prueferRunden, kosten_je_issue: m.kostenJeIssue, dauer_je_issue_min: m.dauerJeIssueMin });
  let fehler = 0;
  for (const m of messungen) {
    for (const [name, value] of Object.entries(werte(m))) {
      if (value === null) continue;
      const id = `modell-${woche}-${m.rolle}-${m.modell}-${name}`;
      const res = await fetch(`${env.LANGFUSE_BASE_URL.replace(/\/+$/, "")}/api/public/scores`, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: `modell.${name}`, value, sessionId: `modell-${woche}-${m.rolle}`, comment: `${m.rolle} · ${m.modell} · Woche ab ${woche}`, metadata: { rolle: m.rolle, modell: m.modell, woche } }),
      });
      if (!res.ok) {
        fehler++;
        console.error(`Langfuse-Score ${id}: ${res.status} ${await res.text()}`);
      }
    }
  }
  if (fehler > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
