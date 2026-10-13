import { createClient } from "@supabase/supabase-js";
import { berlinTag, leseBudget, leseWochenDeckel,leseLangfuse, lesePipeline, leseWerbemittel, zusammenfuehren, type Kosten } from "./kosten";

const MAX_SEITEN = 20;

/** Monatsanfang oder 8 Tage zurück (was früher liegt), damit Zeitzone und Wochenfenster keinen Randtag verlieren. */
const ladeAb = (jetzt: Date) => new Date(Math.min(new Date(berlinTag(jetzt).slice(0, 7) + "-01T00:00:00Z").getTime() - 24 * 3_600_000, jetzt.getTime() - 8 * 24 * 3_600_000));

async function ausSupabase(tabelle: string, spalten: string, ab: Date): Promise<unknown[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const db = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await db.from(tabelle).select(spalten).gte("created_at", ab.toISOString()).limit(10000);
    return error ? null : (data as unknown[]);
  } catch {
    return null;
  }
}

/** Langfuse Cloud, öffentliche API „Daily Metrics“ (Basic Auth mit Public/Secret Key), seitenweise. Null bei Fehler. */
async function ausLangfuse(ab: Date): Promise<unknown[] | null> {
  const basis = process.env.LANGFUSE_BASE_URL?.replace(/\/+$/, "");
  const pub = process.env.LANGFUSE_PUBLIC_KEY;
  const geheim = process.env.LANGFUSE_SECRET_KEY;
  if (!basis || !pub || !geheim) return null;
  const auth = "Basic " + Buffer.from(pub + ":" + geheim).toString("base64");
  const seiten: unknown[] = [];
  try {
    for (let seite = 1; seite <= MAX_SEITEN; seite++) {
      const abfrage = new URLSearchParams({ page: String(seite), limit: "50", fromTimestamp: ab.toISOString() });
      const res = await fetch(basis + "/api/public/metrics/daily?" + abfrage, { headers: { Authorization: auth }, cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const json = (await res.json()) as { meta?: { totalPages?: number } };
      seiten.push(json);
      if (seite >= (json.meta?.totalPages ?? 1)) break;
    }
    return seiten;
  } catch {
    return null;
  }
}

/** Kosten heute und im Monat aus allen Quellen. Nur serverseitig. */
export async function ladeKosten(jetzt = new Date()): Promise<Kosten> {
  const ab = ladeAb(jetzt);
  const kurs = process.env.KOSTEN_USD_EUR ? Number(process.env.KOSTEN_USD_EUR.replace(",", ".")) : null;
  const [pipeline, werbemittel, langfuse] = await Promise.all([
    ausSupabase("pipeline_run_costs", "*", ab),
    ausSupabase("werbemittel", "art,kosten_eur,created_at", ab),
    ausLangfuse(ab),
  ]);
  return zusammenfuehren(
    {
      pipeline: pipeline ? lesePipeline(pipeline) : null,
      werbemittel: werbemittel ? leseWerbemittel(werbemittel) : null,
      langfuse: langfuse ? leseLangfuse(langfuse, kurs !== null && Number.isFinite(kurs) ? kurs : null) : null,
    },
    leseBudget(process.env.KOSTEN_BUDGET_EUR),
    jetzt,
    leseWochenDeckel(process.env.KOSTEN_WOCHE_EUR),
  );
}
