/**
 * Push-Auslöser (SIN-426, SIN-421). Aufruf aus .github/workflows/push-ausloeser.yml (alle 15 Minuten):
 *
 *   npx tsx scripts/push/ausloeser.ts
 *
 * Liest loop_snapshot und loop_events (Supabase), baut „Braucht dich“ genau wie die Startseite (`karten`) und den
 * Stillstand der Schlange, entscheidet mit `plane()` (Ruhezeit 22–7 Uhr, Auswertung 20 Uhr), sendet an alle Abos und
 * merkt sich Gesendetes in `leitstand_push_gesendet`. Kein KI-Aufruf.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
 * DRY_RUN=1: nur Ausgabe im Log, nichts gesendet oder gespeichert.
 */
import { createClient } from "@supabase/supabase-js";
import { brauchtDichAus, plane, stillstandAus, type Schlange } from "../../src/lib/push/ausloeser";
import { sendeAnAlle } from "../../src/lib/push/push";
import { supabaseSpeicher, vapidSender } from "../../src/lib/push/server";
import { projektInfo } from "../../src/lib/projekte";
import { ladeQuelle, type Lesequelle } from "../../src/lib/supabase";
import { karten } from "../../src/lib/uebersicht-einfach";
import { wartendePrs } from "../../src/lib/wartende-prs";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const MERKEN_TAGE = 14;

async function main() {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("::warning::SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt, nichts zu tun.");
    return;
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const speicher = supabaseSpeicher(url, key);
  const abos = await speicher.alle();
  // Ohne Abo nichts als gesendet merken: wer den Schalter einschaltet, bekommt beim nächsten Lauf den aktuellen Stand.
  if (abos.length === 0 && !DRY) {
    console.log("Kein Abo: Schalter „Mitteilungen“ in den Einstellungen der Home-Bildschirm-App ist aus.");
    return;
  }
  const sender = vapidSender();
  if (!sender && !DRY) {
    console.log("::warning::VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY oder VAPID_SUBJECT fehlt: keine Mitteilung möglich.");
    return;
  }

  const jetzt = new Date();
  const geladen = await ladeQuelle(db as unknown as Lesequelle, jetzt);
  if (geladen.zustand !== "ok") throw new Error("loop_events oder loop_snapshot nicht lesbar");
  const q = geladen.quelle;

  const wartend = karten(q, wartendePrs(q.snapshot)).map((k) => ({ key: k.key, titel: k.titel, projekt: k.projekt || "Leitstand" }));

  // shortcut: Stillstand nur für Projekte mit `queue` im Snapshot (Lern-App); der Leitstand bekommt seine Schlange mit SIN-572.
  const { data: rohSchlangen, error } = await db.from("loop_snapshot").select("project, queue");
  if (error) throw new Error(`loop_snapshot.queue: ${error.message}`);
  const schlangen: Schlange[] = (rohSchlangen ?? []).map((r: { project: string; queue: Record<string, unknown> | null }) => {
    const queue = r.queue ?? {};
    const letztes = q.events.find((e) => e.project === r.project);
    return {
      projekt: r.project,
      name: projektInfo(r.project).name,
      startbar: Number(queue.startable ?? 0),
      laeuft: Number(queue.running ?? 0) + Number(queue.in_progress ?? 0),
      pausiert: queue.paused === true,
      letztesEreignis: letztes ? Date.parse(letztes.created_at) : null,
    };
  });

  const ereignisse = [...brauchtDichAus(wartend, jetzt.getTime()), ...stillstandAus(schlangen, jetzt.getTime())];
  const ab = new Date(jetzt.getTime() - MERKEN_TAGE * 24 * 3_600_000).toISOString();
  const { data: rohGesendet, error: fehlerGesendet } = await db.from("leitstand_push_gesendet").select("schluessel").gte("gesendet_at", ab);
  if (fehlerGesendet) throw new Error(`leitstand_push_gesendet: ${fehlerGesendet.message}`);
  const gesendet = new Set((rohGesendet ?? []).map((r: { schluessel: string }) => r.schluessel));

  const plan = plane(ereignisse, gesendet, jetzt.getTime());
  console.log(`Abos: ${abos.length}, Ereignisse: ${ereignisse.length}, Mitteilungen: ${plan.nachrichten.length}`);
  for (const n of plan.nachrichten) console.log(`- ${n.titel}: ${n.text.replace(/\n/g, " / ")}`);
  if (DRY || plan.nachrichten.length === 0) return;

  for (const n of plan.nachrichten) {
    const r = await sendeAnAlle(speicher, sender!, n);
    console.log(`  ${n.titel}: zugestellt ${r.gesendet}, abgelaufen ${r.entfernt}, Fehler ${r.fehler}`);
  }
  // Auch bei einzelnen Fehlern merken: sonst kommt dieselbe Mitteilung alle 15 Minuten wieder.
  if (plan.neu.length) {
    const { error: fehlerMerken } = await db.from("leitstand_push_gesendet").upsert(plan.neu.map((schluessel) => ({ schluessel })), { onConflict: "schluessel", ignoreDuplicates: true });
    if (fehlerMerken) throw new Error(`Gesendetes nicht gespeichert: ${fehlerMerken.message}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
