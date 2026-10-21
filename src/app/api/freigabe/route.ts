import { bereicheAusDateien } from "@/lib/bereiche";
import { freigeben, githubNetz, grundFuerFreigabe, istPrNummer, istRepo, protokollZeile, type Netz } from "@/lib/freigabe";
import { protokolliere, verweigert } from "@/lib/server-nutzer";

export const dynamic = "force-dynamic";

const antwort = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function netz(): Netz | null {
  const token = process.env.LEITSTAND_GITHUB_TOKEN;
  return token ? githubNetz(token) : null;
}

/** Lesen: PR-Kopf, Bereiche und Grund. Dateien kommen serverseitig von GitHub. */
export async function GET(anfrage: Request) {
  const nein = await verweigert(anfrage);
  if (nein) return nein;
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
  const nein = await verweigert(anfrage);
  if (nein) return nein;
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
