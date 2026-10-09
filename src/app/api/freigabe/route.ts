import { createClient } from "@supabase/supabase-js";
import { bereicheAusDateien } from "@/lib/bereiche";
import { freigeben, githubNetz, grundFuerFreigabe, istPrNummer, istRepo, protokollZeile, type Netz } from "@/lib/freigabe";

export const dynamic = "force-dynamic";

const antwort = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Nur Sinan: gültige Sitzung und eine Zeile in `leitstand_nutzer`, die RLS dem Nutzer zeigt. */
async function istLeitstandNutzer(anfrage: Request): Promise<boolean> {
  const token = /^Bearer (.+)$/.exec(anfrage.headers.get("authorization") ?? "")?.[1];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return false;
  try {
    const client = createClient(url, key, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: nutzer, error } = await client.auth.getUser(token);
    if (error || !nutzer.user) return false;
    const { data, error: lesefehler } = await client.from("leitstand_nutzer").select("*").limit(1);
    return !lesefehler && Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

function netz(): Netz | null {
  const token = process.env.LEITSTAND_GITHUB_TOKEN;
  return token ? githubNetz(token) : null;
}

/** Protokoll in loop_events (nur mit Service-Role-Key, serverseitig). Gibt zurück, ob geschrieben wurde. */
async function protokolliere(zeile: ReturnType<typeof protokollZeile>): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/rest/v1/loop_events`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(zeile),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Lesen: PR-Kopf, Bereiche und Grund. Dateien kommen serverseitig von GitHub. */
export async function GET(anfrage: Request) {
  if (!(await istLeitstandNutzer(anfrage))) return antwort(401, { fehler: "nicht angemeldet" });
  const query = new URL(anfrage.url).searchParams;
  const repo = query.get("repo");
  const nr = Number(query.get("pr"));
  if (!istRepo(repo) || !istPrNummer(nr)) return antwort(400, { fehler: "repo oder pr ungültig" });
  const github = netz();
  if (!github) return antwort(503, { fehler: "GitHub-Token fehlt" });
  try {
    const [pr, dateien] = await Promise.all([github.pr(repo, nr), github.dateien(repo, nr)]);
    return antwort(200, {
      pr: { nummer: pr.number, titel: pr.title, autor: pr.user, zweig: pr.head, ziel: pr.base, status: pr.merged ? "gemergt" : pr.state, entwurf: pr.draft, url: pr.html_url, labels: pr.labels },
      dateien: dateien.length,
      bereiche: bereicheAusDateien(dateien, pr.body),
      grund: grundFuerFreigabe(pr.labels, dateien),
    });
  } catch {
    return antwort(502, { fehler: "GitHub nicht erreichbar" });
  }
}

/** Freigeben: Label oder Squash-Merge mit eigenem Token, danach Eintrag in loop_events. */
export async function POST(anfrage: Request) {
  if (!(await istLeitstandNutzer(anfrage))) return antwort(401, { fehler: "nicht angemeldet" });
  const body: unknown = await anfrage.json().catch(() => null);
  const eingabe = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (!istRepo(eingabe.repo) || !istPrNummer(eingabe.pr)) return antwort(400, { fehler: "repo oder pr ungültig" });
  const github = netz();
  if (!github) return antwort(503, { fehler: "GitHub-Token fehlt" });
  const ergebnis = await freigeben(github, eingabe.repo, eingabe.pr);
  const protokolliert = await protokolliere(protokollZeile(eingabe.repo, eingabe.pr, ergebnis));
  if (!ergebnis.ok) return antwort(ergebnis.grund === "github" ? 502 : 409, { fehler: ergebnis.grund, protokolliert });
  return antwort(200, { aktion: ergebnis.aktion, protokolliert });
}
