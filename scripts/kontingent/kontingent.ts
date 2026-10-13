/**
 * Kontingent-Pausen (SIN-581). Aufruf aus Workflows:
 *
 *   npx tsx scripts/kontingent/kontingent.ts melden --dienst claude [--log datei] [--repo owner/name] [--minuten 2]
 *       Limit im Log erkannt (oder --minuten für den Trockenlauf): Zeile in `kontingent_pausen`, Ereignis `pause`.
 *       Ohne Limit-Meldung im Log passiert nichts (Exit 0), mit Pause Exit 0 und Ausgabe `pausiert=true` für $GITHUB_OUTPUT.
 *   npx tsx scripts/kontingent/kontingent.ts pruefen --dienst claude[,openai]
 *       Exit 3, wenn eine der Pausen läuft (Ereignis `uebersprungen`), sonst 0.
 *   npx tsx scripts/kontingent/kontingent.ts wecken
 *       Abgelaufene, noch nicht geweckte Pausen: dispatch der betroffenen Workflows anstoßen, `geweckt_at` setzen, Ereignis `wieder-da`.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; für `wecken` GH_TOKEN (AGENT_WORKFLOW_TOKEN, Recht `actions: write` auf beiden Repos),
 * für Vercel VERCEL_DEPLOY_HOOK (URL des Deploy-Hooks für main). DRY_RUN=1: nur Log.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { abgelaufen, aktivePause, istDienst, istLimitMeldung, pauseSatz, resetZeit, WECK_ZIELE, type Dienst } from "../../src/lib/kontingent/kontingent";
import { ereignis, ladeOffenePausen, markiereGeweckt, schreibePause } from "./pausen";

const env = process.env;
const DRY = env.DRY_RUN === "1";
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const dienste = (arg("dienst") ?? "").split(",").filter(istDienst) as Dienst[];

async function melden() {
  const dienst = dienste[0];
  if (!dienst) throw new Error("--dienst fehlt oder unbekannt");
  const jetzt = new Date();
  const minuten = Number(arg("minuten"));
  const log = arg("log") ? readFileSync(arg("log")!, "utf8") : "";
  if (!minuten && !istLimitMeldung(log)) return console.log("Keine Limit-Meldung im Log, keine Pause.");
  const bis = minuten ? new Date(jetzt.getTime() + minuten * 60_000) : resetZeit(dienst, { log }, jetzt);
  const grund = minuten ? `Trockenlauf, ${minuten} Minuten` : (log.split("\n").find(istLimitMeldung) ?? "Limit erreicht").trim().slice(0, 200);
  console.log(`${pauseSatz({ dienst, bis: bis.toISOString() }, jetzt)} (${grund})`);
  await schreibePause({ dienst, bis, grund, repo: arg("repo") ?? env.GITHUB_REPOSITORY ?? null });
  await ereignis("pause");
  if (env.GITHUB_OUTPUT && !DRY) appendFileSync(env.GITHUB_OUTPUT, "pausiert=true\n");
}

async function pruefen() {
  const jetzt = new Date();
  const pausen = await ladeOffenePausen();
  for (const d of dienste) {
    const p = aktivePause(pausen, d, jetzt);
    if (!p) continue;
    console.log(`Nicht gestartet. ${pauseSatz(p, jetzt)}`);
    await ereignis("uebersprungen");
    process.exit(3);
  }
}

async function dispatchWorkflow(repo: string, workflow: string) {
  if (DRY) return console.log(`[Trockenlauf] würde ${repo}/${workflow} anstoßen`);
  if (!env.GH_TOKEN) throw new Error("GH_TOKEN fehlt (Secret AGENT_WORKFLOW_TOKEN)");
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main" }),
  });
  if (!res.ok) throw new Error(`${repo}/${workflow}: HTTP ${res.status} ${await res.text()}`);
  console.log(`${repo}/${workflow} angestoßen`);
}

async function wecken() {
  const jetzt = new Date();
  const faellig = abgelaufen(await ladeOffenePausen(), jetzt);
  if (!faellig.length) return console.log("Keine abgelaufene Pause.");
  for (const p of faellig) {
    try {
      for (const z of WECK_ZIELE[p.dienst] ?? []) await dispatchWorkflow(z.repo, z.workflow);
      if (p.dienst === "vercel_deploys") {
        // Redeploy des letzten main-Standes über den Deploy-Hook.
        if (!env.VERCEL_DEPLOY_HOOK) throw new Error("VERCEL_DEPLOY_HOOK fehlt");
        if (DRY) console.log("[Trockenlauf] würde den Vercel-Redeploy auslösen");
        else if (!(await fetch(env.VERCEL_DEPLOY_HOOK, { method: "POST" })).ok) throw new Error("Vercel-Deploy-Hook fehlgeschlagen");
      }
    } catch (e) {
      // Nicht als geweckt markieren: der nächste Lauf versucht es erneut.
      console.log(`::warning::${p.dienst} nicht geweckt: ${(e as Error).message}`);
      continue;
    }
    await markiereGeweckt(p.id!);
    await ereignis("wieder-da");
    console.log(`${p.dienst} wieder da.`);
  }
}

const befehl = process.argv[2];
const lauf = befehl === "melden" ? melden : befehl === "pruefen" ? pruefen : befehl === "wecken" ? wecken : null;
if (!lauf) {
  console.error("Aufruf: kontingent.ts melden|pruefen|wecken");
  process.exit(2);
}
lauf().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
