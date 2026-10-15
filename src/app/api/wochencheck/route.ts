import { linearNetz } from "@/lib/idee";
import { leitstandNutzer } from "@/lib/server-nutzer";
import { EINSTELLUNG, ergebnisEingabe, ergebnisMarkdown, pushStunde } from "@/lib/wochencheck/wochencheck";
import { berlinZeit } from "@/lib/push/ausloeser";

export const dynamic = "force-dynamic";

const antwort = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const kopf = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  return (pfad: string, init: RequestInit = {}) => fetch(`${url}/rest/v1/${pfad}`, { ...init, headers: { ...kopf, ...init.headers }, cache: "no-store" });
}

/** Linear-Issue im Projekt Leitstand; fehlt ein Label, wird es weggelassen (außer `gedaechtnis` bei Vorrang, siehe Aufrufer). */
async function issueAnlegen(key: string, titel: string, label: string): Promise<string | null> {
  const netz = linearNetz(key);
  try {
    const projekt = await netz.projekt("Leitstand");
    if (!projekt) return null;
    const labelId = (await netz.labels(projekt.teamId)).find((l) => l.name.toLowerCase() === label)?.id;
    if (label === "gedaechtnis" && !labelId) return null;
    return (await netz.anlegen({ teamId: projekt.teamId, projectId: projekt.id, title: titel, labelIds: labelId ? [labelId] : [] })).identifier;
  } catch {
    return null;
  }
}

/** Uhrzeit des Push und ob diese Woche schon abgeschlossen wurde. */
export async function GET(anfrage: Request) {
  if (!(await leitstandNutzer(anfrage))) return antwort(401, { fehler: "nicht angemeldet" });
  const q = db();
  if (!q) return antwort(503, { fehler: "Supabase nicht eingerichtet" });
  const res = await q(`leitstand_einstellungen?select=wert&schluessel=eq.${EINSTELLUNG}`);
  if (!res.ok) return antwort(502, { fehler: "Einstellung nicht lesbar" });
  return antwort(200, { stunde: pushStunde(((await res.json()) as { wert: string }[])[0]?.wert) });
}

/** `{ stunde }` speichert die Push-Uhrzeit; `{ haken, fehler, vorrang }` schließt den Check ab: Korrektur-Issues, Vorrang-Issue, Notiz fürs Gedächtnis. */
export async function POST(anfrage: Request) {
  if (!(await leitstandNutzer(anfrage))) return antwort(401, { fehler: "nicht angemeldet" });
  const q = db();
  if (!q) return antwort(503, { fehler: "Supabase nicht eingerichtet" });
  const body: unknown = await anfrage.json().catch(() => null);
  const speichern = (pfad: string, zeile: object, konflikt: string) => q(`${pfad}?on_conflict=${konflikt}`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(zeile) });

  if (body && typeof body === "object" && "stunde" in body) {
    const wert = String((body as { stunde: unknown }).stunde);
    if (pushStunde(wert) !== Number(wert)) return antwort(400, { fehler: "Stunde muss 0 bis 23 sein" });
    const res = await speichern("leitstand_einstellungen", { schluessel: EINSTELLUNG, wert, aktualisiert_at: new Date().toISOString() }, "schluessel");
    return res.ok ? antwort(200, { stunde: Number(wert) }) : antwort(502, { fehler: "Einstellung nicht gespeichert" });
  }

  const eingabe = ergebnisEingabe(body);
  if (!eingabe) return antwort(400, { fehler: "Eingabe ungültig" });
  const key = process.env.LINEAR_API_KEY;
  const issues: string[] = [];
  const offen: string[] = [];
  if (key) {
    for (const z of eingabe.fehler) {
      const id = await issueAnlegen(key, `Korrektur: ${z}`, "korrektur");
      if (id) issues.push(id);
      else offen.push(z);
    }
    if (eingabe.vorrang) {
      const id = await issueAnlegen(key, `Vorrang nächste Woche: ${eingabe.vorrang}`, "gedaechtnis");
      if (id) issues.push(id);
      else offen.push(eingabe.vorrang);
    }
  } else offen.push(...eingabe.fehler, ...(eingabe.vorrang ? [eingabe.vorrang] : []));
  const tag = berlinZeit(Date.now()).tag;
  const notiz = ergebnisMarkdown(tag, eingabe, issues) + (offen.length ? `\nKein Linear-Issue angelegt für: ${offen.join("; ")}\n` : "");
  const res = await speichern("leitstand_wochencheck", { tag, notiz }, "tag");
  return res.ok ? antwort(200, { issues, ohneIssue: offen.length }) : antwort(502, { fehler: "Ergebnis nicht gespeichert" });
}
