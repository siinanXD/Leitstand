/**
 * Werkzeug-Prüfung (SIN-544). Aufruf (Vorlage: docs/werkzeuge/werkzeuge.yml.vorlage):
 *
 *   npx tsx scripts/werkzeuge/pruefen.ts
 *
 * Je Tool eine lesende Anfrage mit dem Key aus der Umgebung. Ergebnis in `leitstand_werkzeug_status`.
 * Fehlt ein Key, ist das Tool rot („Key fehlt: …“); Keys trägt dieses Skript nie ein.
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, die Keys der Tools (siehe src/lib/werkzeuge/werkzeuge.ts). DRY_RUN=1: nur anzeigen.
 */
import { createClient } from "@supabase/supabase-js";
import { bewerte, fehlendeKeys, WERKZEUGE, type Pruefung, type Werkzeug } from "../../src/lib/werkzeuge/werkzeuge";

const env = process.env;
const DRY = env.DRY_RUN === "1";

async function pruefe(w: Werkzeug): Promise<Pruefung> {
  const fehlt = fehlendeKeys(w, env);
  if (fehlt.length) return { ok: false, hinweis: `Key fehlt: ${fehlt.join(", ")}` };
  const antworten = await Promise.all(
    w.anfragen(env).map(async (a) => {
      try {
        const res = await fetch(a.url, { method: a.methode ?? "GET", headers: a.header, body: a.body, signal: AbortSignal.timeout(15000) });
        // Linear antwortet bei falschem Key mit 200 und `errors`.
        const fehler = res.ok && a.methode === "POST" ? Boolean(((await res.json()) as { errors?: unknown }).errors) : false;
        return { status: res.status, fehler };
      } catch {
        return { status: 0 };
      }
    }),
  );
  return bewerte(antworten);
}

// Kein Top-Level-await: tsx baut dieses Skript als CommonJS (kein "type": "module"), sonst ERR_REQUIRE_ASYNC_MODULE.
async function main() {
  const db = !DRY && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : null;
  if (!DRY && !db) throw new Error("SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY fehlen");

  let schreibFehler = 0;
  for (const w of WERKZEUGE) {
    const p = await pruefe(w);
    console.log(`${DRY ? "[trocken] " : ""}${w.name}: ${p.ok ? "grün" : "rot"}${p.hinweis ? ` (${p.hinweis})` : ""}`);
    if (!db) continue;
    const jetzt = new Date().toISOString();
    // letzte_ok_at nur bei Erfolg setzen: je Zeile einzeln, damit der alte Wert bei Rot stehen bleibt.
    const { error } = await db.from("leitstand_werkzeug_status").upsert({ id: w.id, ok: p.ok, hinweis: p.hinweis, geprueft_at: jetzt, ...(p.ok ? { letzte_ok_at: jetzt } : {}) });
    if (error) {
      schreibFehler++;
      console.warn(`${w.name}: Schreiben fehlgeschlagen (${error.message})`);
    }
  }
  if (schreibFehler) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
