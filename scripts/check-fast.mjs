#!/usr/bin/env node
// SIN-875: Schnell-Prüfung vor dem Push (Lint, Typecheck, Unit-Tests) – ohne Keys.
// Entfernt Secrets aus der Umgebung, damit kein Test still einen echten Dienst
// (Supabase, Claude/OpenAI, Langfuse, Sentry, Linear) aufruft. Externe Dienste
// sind in den Unit-Tests gemockt. Läuft identisch beim Worker (vor dem Push) und in
// CI (`build`). Build, Playwright und axe laufen nur in CI – die bleiben das Tor.
import { spawn } from "node:child_process";

const GEHEIM = /(KEY|TOKEN|SECRET|PASSWORD|DSN)$|^(SUPABASE|LANGFUSE|SENTRY|ANTHROPIC|OPENAI|LINEAR|INFISICAL|FIGMA|POSTHOG|VAPID|CLAUDE_CODE_OAUTH)_/i;
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !GEHEIM.test(k)));
const entfernt = Object.keys(process.env).length - Object.keys(env).length;

function lauf(script) {
  const start = Date.now();
  return new Promise((resolve) => {
    const kind = spawn("npm", ["run", "-s", script], { env, shell: process.platform === "win32" });
    let ausgabe = "";
    kind.stdout.on("data", (d) => (ausgabe += d));
    kind.stderr.on("data", (d) => (ausgabe += d));
    kind.on("close", (code) => resolve({ script, code, sek: Math.round((Date.now() - start) / 1000), ausgabe }));
  });
}

const start = Date.now();
console.log(`check:fast – ${entfernt} Secret-Variable(n) ausgeblendet; Lint + Typecheck parallel, danach Tests …`);
// Tests laufen allein (wie in CI): einige Tests warten auf Zeitgeber und werden unter
// Last durch parallelen Lint/Typecheck wackelig.
const ergebnisse = [...(await Promise.all(["lint", "typecheck"].map(lauf))), await lauf("test")];
for (const e of ergebnisse) {
  console.log(`${e.code === 0 ? "grün" : "ROT "}  ${e.script.padEnd(9)} ${e.sek}s`);
  if (e.code !== 0) console.log(e.ausgabe);
}
const rot = ergebnisse.filter((e) => e.code !== 0);
console.log(`check:fast ${rot.length ? "ROT" : "grün"} in ${Math.round((Date.now() - start) / 1000)}s`);
process.exit(rot.length ? 1 : 0);
