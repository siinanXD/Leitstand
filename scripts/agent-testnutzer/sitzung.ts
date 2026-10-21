/**
 * Agent-Testkonto (SIN-913): legt das Konto idempotent an und schreibt eine Playwright-`storageState`-Datei. Aufruf aus agent-testnutzer.yml:
 *
 *   npx tsx scripts/agent-testnutzer/sitzung.ts <ausgabe.json>
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, AGENT_TESTNUTZER_EMAIL (Repo-Variable), LEITSTAND_URL.
 * Die Sitzung lebt nur im Job (Ausgabe unter RUNNER_TEMP); sie wird nie als Artefakt hochgeladen. DRY_RUN=1: nur Konfiguration prüfen, kein Netz.
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { baueStorageState, stelleKontoSicher } from "../../src/lib/agent-testnutzer/sitzung";

async function main(): Promise<void> {
  const env = process.env;
  const ausgabe = process.argv[2];
  const fehlt = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "AGENT_TESTNUTZER_EMAIL", "LEITSTAND_URL"].filter((n) => !env[n]);

  if (!ausgabe) throw new Error("Aufruf: sitzung.ts <ausgabe.json>");
  if (env.DRY_RUN === "1" || env.DRY_RUN === "true") {
    console.log(fehlt.length ? `Trockenlauf: nicht gesetzt: ${fehlt.join(", ")}` : "Trockenlauf: Konfiguration vollständig");
    return;
  }
  if (fehlt.length) throw new Error(`Nicht gesetzt: ${fehlt.join(", ")}`);

  const [url, dienst, anon, email, leitstand] = [env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, env.AGENT_TESTNUTZER_EMAIL!, env.LEITSTAND_URL!];
  const optionen = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, dienst, optionen);

  // Konto anlegen oder finden, Marker und leitstand_nutzer-Zeile immer setzen (Lesen wie Sinan; Spalte user_id wie in den Policies).
  await stelleKontoSicher(admin, email);

  const state = await baueStorageState(admin, createClient(url, anon, optionen), email, url, leitstand);
  writeFileSync(ausgabe, JSON.stringify(state), { mode: 0o600 });
  console.log("Sitzung für das Testkonto geschrieben.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
