/** Werkzeuge (SIN-544): je Tool eine Aufgabe und eine Verbindungsprüfung. Rein, ohne Netz; scripts/werkzeuge/pruefen.ts führt die Anfragen aus. */

export type Anfrage = { url: string; methode?: "GET" | "POST"; header: Record<string, string>; body?: string };
export type Umgebung = Readonly<Record<string, string | undefined>>;

export type Werkzeug = {
  id: string;
  name: string;
  /** „Was macht es für dich“ in einem Satz. */
  aufgabe: string;
  /** Pflicht-Variablen; fehlt eine, ist das Tool rot („Key fehlt“). */
  keys: string[];
  anfragen(env: Umgebung): Anfrage[];
};

const basic = (u: string, p: string) => "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
const ohneSchraegstrich = (u: string) => u.replace(/\/+$/, "");
const FIGMA_DATEI = "7Ti9iVUjUjw3rh9WYhSu9K";

export const WERKZEUGE: Werkzeug[] = [
  {
    id: "sentry",
    name: "Sentry",
    aufgabe: "Meldet Fehler der echten App und legt dafür ein Linear-Issue an.",
    keys: ["SENTRY_AUTH_TOKEN", "SENTRY_ORG"],
    anfragen: (e) => [{ url: `https://sentry.io/api/0/organizations/${encodeURIComponent(e.SENTRY_ORG ?? "")}/projects/`, header: { Authorization: `Bearer ${e.SENTRY_AUTH_TOKEN}` } }],
  },
  {
    id: "posthog",
    name: "PostHog",
    aufgabe: "Zeigt, wo Lernende abbrechen; Eingabe für „was ist wichtig“.",
    keys: ["POSTHOG_PERSONAL_API_KEY"],
    anfragen: (e) => [{ url: `${ohneSchraegstrich(e.POSTHOG_HOST ?? "https://eu.posthog.com")}/api/projects/`, header: { Authorization: `Bearer ${e.POSTHOG_PERSONAL_API_KEY}` } }],
  },
  {
    id: "langfuse",
    name: "Langfuse",
    aufgabe: "Zählt Kosten und Qualität jedes KI-Laufs; Grundlage für den Kostendeckel.",
    keys: ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_BASE_URL"],
    anfragen: (e) => [{ url: `${ohneSchraegstrich(e.LANGFUSE_BASE_URL ?? "")}/api/public/projects`, header: { Authorization: basic(e.LANGFUSE_PUBLIC_KEY ?? "", e.LANGFUSE_SECRET_KEY ?? "") } }],
  },
  {
    id: "modelle",
    name: "OpenAI / Anthropic",
    aufgabe: "Die Modelle für Richter und Generator; getrackt wird nur über Langfuse.",
    keys: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"],
    anfragen: (e): Anfrage[] => [
      { url: "https://api.openai.com/v1/models", header: { Authorization: `Bearer ${e.OPENAI_API_KEY}` } },
      { url: "https://api.anthropic.com/v1/models", header: { "x-api-key": e.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" } },
    ],
  },
  {
    id: "postman",
    name: "Postman",
    aufgabe: "Erzeugt API-Tests aus der OpenAPI; die Prüfen-Rolle führt sie aus.",
    keys: ["POSTMAN_API_KEY"],
    anfragen: (e) => [{ url: "https://api.getpostman.com/me", header: { "X-Api-Key": e.POSTMAN_API_KEY ?? "" } }],
  },
  {
    id: "figma",
    name: "Figma",
    aufgabe: "Einzige Design-Quelle; die Bauen-Rolle liest Werte von dort.",
    keys: ["FIGMA_ACCESS_TOKEN"],
    anfragen: (e) => [{ url: `https://api.figma.com/v1/files/${FIGMA_DATEI}?depth=1`, header: { "X-Figma-Token": e.FIGMA_ACCESS_TOKEN ?? "" } }],
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    aufgabe: "Sucht Modelle und Datensätze für die Research-Rolle.",
    keys: ["HF_TOKEN"],
    anfragen: (e) => [{ url: "https://huggingface.co/api/whoami-v2", header: { Authorization: `Bearer ${e.HF_TOKEN}` } }],
  },
  {
    id: "linear",
    name: "Linear",
    aufgabe: "Die Aufgabenliste, aus der alle Rollen arbeiten.",
    keys: ["LINEAR_API_KEY"],
    anfragen: (e) => [{ url: "https://api.linear.app/graphql", methode: "POST", header: { Authorization: e.LINEAR_API_KEY ?? "", "Content-Type": "application/json" }, body: JSON.stringify({ query: "{ viewer { id } }" }) }],
  },
];

export type Pruefung = { ok: boolean; hinweis: string | null };

export const fehlendeKeys = (w: Werkzeug, env: Umgebung): string[] => w.keys.filter((k) => !env[k]);

/** Antworten (Statuscode, bei Linear zusätzlich `errors` im Body) zu einem Ergebnis; der Body kommt nie ins Ergebnis. */
export function bewerte(antworten: { status: number; fehler?: boolean }[]): Pruefung {
  const schlecht = antworten.find((a) => a.status < 200 || a.status >= 300 || a.fehler);
  if (!schlecht) return { ok: true, hinweis: null };
  return { ok: false, hinweis: schlecht.status === 429 ? "Zu viele Abrufe (HTTP 429)" : schlecht.status === 0 ? "Nicht erreichbar" : schlecht.status >= 300 ? `HTTP ${schlecht.status}` : "Antwort mit Fehler" };
}

export type Zeile = { id: string; name: string; aufgabe: string; ok: boolean | null; hinweis: string | null; geprueftAt: string | null; letzteOkAt: string | null };

const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** Alle Werkzeuge in fester Reihenfolge; ohne gespeicherte Zeile steht der Status auf „unbekannt“ (ok: null), nichts wird geraten. */
export function zeilen(roh: unknown): Zeile[] {
  const je = new Map<string, Record<string, unknown>>();
  for (const r of Array.isArray(roh) ? roh : []) if (r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string") je.set((r as { id: string }).id, r as Record<string, unknown>);
  return WERKZEUGE.map((w) => {
    const r = je.get(w.id);
    return { id: w.id, name: w.name, aufgabe: w.aufgabe, ok: typeof r?.ok === "boolean" ? r.ok : null, hinweis: text(r?.hinweis), geprueftAt: text(r?.geprueft_at), letzteOkAt: text(r?.letzte_ok_at) };
  });
}
