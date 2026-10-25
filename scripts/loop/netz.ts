// SIN-1052: bestehende Loop-CLI in abgegrenzte Module zerlegt; Policy und Vertrauensgrenzen bleiben erhalten.
import { istLaufzustand, istWiederholung, type LetztesEreignis } from "../../src/lib/loop/wiederholung";

export const env = process.env;

export const DRY = env.DRY_RUN === "1";

export const repo = env.GITHUB_REPOSITORY ?? "siinanXD/leitstand";

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

export async function linear<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (!env.LINEAR_API_KEY) throw new Error("LINEAR_API_KEY fehlt");
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: env.LINEAR_API_KEY },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (!res.ok || json.errors) throw new Error(`Linear: ${res.status} ${JSON.stringify(json.errors ?? "")}`);
  return json.data as T;
}

export async function gh<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!env.GH_TOKEN) throw new Error("GH_TOKEN fehlt (Secret AGENT_WORKFLOW_TOKEN)");
  const res = await fetch(`https://api.github.com${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

/** Ein Ereignis in loop_events (SIN-303). Fehler werden nur gemeldet. */
type Extra = { issue?: string; pr?: number; grund?: string; projekt?: string };

/** `uebersprungen` und `fehler` brauchen immer einen Grund (SIN-654, SIN-617), sonst ist im Leitstand nicht erkennbar, warum nichts lief. */
export async function ereignis(step: string, status: "uebersprungen" | "fehler", extra: Extra & { grund: string }): Promise<void>;

export async function ereignis(step: string, status: "start" | "ok", extra?: Extra): Promise<void>;

export async function ereignis(step: string, status: "start" | "ok" | "fehler" | "uebersprungen", extra: Extra = {}) {
  if (extra.grund) console.log(`${step}/${status}: ${extra.grund}`);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`::warning::Kein loop_event (${step}/${status}): SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt.`);
    return;
  }
  if (DRY) return;
  const projekt = extra.projekt ?? "leitstand";
  if (istLaufzustand(step, status) && istWiederholung(await letztesEreignis(projekt, step, extra.issue ?? null), { step, status, grund: extra.grund ?? null }, new Date())) return;
  const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${repo}/actions/runs/${env.GITHUB_RUN_ID}` : null;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(ereignisZeile(projekt, step, status, extra, runUrl)),
  }).catch((e: Error) => ({ ok: false, status: 0, text: async () => e.message }));
  if (!res.ok) console.log(`::warning::loop_event nicht geschrieben: ${res.status} ${await res.text()}`);
}

/** Letztes Ereignis zu Projekt, Schritt und Issue; bei Lesefehler `null` (dann wird geschrieben, nichts geht verloren). */
async function letztesEreignis(projekt: string, step: string, issue: string | null): Promise<LetztesEreignis | null> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY!;
  const q = new URLSearchParams({ project: `eq.${projekt}`, step: `eq.${step}`, issue: issue ? `eq.${issue}` : "is.null", select: "status,grund,created_at", order: "created_at.desc", limit: "1" });
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/loop_events?${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    return res.ok ? (((await res.json()) as LetztesEreignis[])[0] ?? null) : null;
  } catch {
    return null;
  }
}

export const laufUrl = () => (env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${repo}/actions/runs/${env.GITHUB_RUN_ID}` : null);

function ereignisZeile(project: string, step: string, status: string, extra: Extra, run_url: string | null) {
  return { project, step, status, grund: extra.grund ?? null, issue: extra.issue ?? null, pr: extra.pr ?? null, run_id: env.GITHUB_RUN_ID ?? null, run_url };
}
