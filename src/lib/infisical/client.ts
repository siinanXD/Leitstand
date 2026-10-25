// Infisical-Schnittstelle (EU) für SIN-1051, mit eingesetztem `fetch` testbar. Endpunkte: Infisical API Reference
// (infisical.com/docs/api-reference), Abschnitte „Folders“ und „Secrets (raw)“. Das Lesen der Variablenliste liefert technisch
// auch Werte; sie werden hier sofort verworfen (nur Name und `leer` verlassen die Funktion) und nie geloggt.
import type { Aktion, Ist } from "./abgleich";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export type Verbindung = { fetch: Fetch; token: string; projektId: string; basis?: string };

export class InfisicalFehler extends Error {
  constructor(readonly status: number, was: string) {
    super(`Infisical ${was}: HTTP ${status}`);
  }
}

const BASIS = "https://eu.infisical.com";
const kopf = (v: Verbindung) => ({ Authorization: `Bearer ${v.token}`, "Content-Type": "application/json" });
const url = (v: Verbindung, pfad: string, q: Record<string, string> = {}) => `${v.basis ?? BASIS}${pfad}?${new URLSearchParams(q)}`;

/** Ordner `/a` heißt `a` unter `/`; tiefere Pfade `/a/b` heißen `b` unter `/a`. */
export const teileOrdner = (pfad: string) => {
  const i = pfad.lastIndexOf("/");
  return { eltern: i <= 0 ? "/" : pfad.slice(0, i), name: pfad.slice(i + 1) };
};

async function lese<T>(v: Verbindung, pfad: string, q: Record<string, string>, was: string): Promise<T | null> {
  const res = await v.fetch(url(v, pfad, q), { headers: kopf(v), signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new InfisicalFehler(res.status, was);
  return (await res.json()) as T;
}

/** Ist-Zustand für die gewünschten Ordner und Umgebungen: nur Namen und „leer“. */
export async function ladeIst(v: Verbindung, ziele: { environment: string; pfad: string }[]): Promise<Ist> {
  const ist: Ist = { ordner: [], variablen: [] };
  for (const { environment, pfad } of ziele) {
    const { eltern, name } = teileOrdner(pfad);
    const ordner = await lese<{ folders?: { name: string }[] }>(v, "/api/v1/folders", { workspaceId: v.projektId, environment, path: eltern }, `Ordner ${eltern}`);
    if (!ordner?.folders?.some((f) => f.name === name)) continue;
    ist.ordner.push({ environment, pfad });
    const liste = await lese<{ secrets?: { secretKey: string; secretValue?: string }[] }>(v, "/api/v3/secrets/raw", { workspaceId: v.projektId, environment, secretPath: pfad }, `Variablen ${pfad}`);
    for (const s of liste?.secrets ?? []) ist.variablen.push({ environment, pfad, name: s.secretKey, leer: !s.secretValue });
  }
  return ist;
}

/** Führt Anlege-Aktionen aus: nur POST, Variablen immer mit leerem Wert. Ein Name, den es schon gibt (HTTP 409), bleibt unberührt. */
export async function legeAn(v: Verbindung, aktion: Aktion): Promise<"angelegt" | "vorhanden"> {
  const { eltern, name } = teileOrdner(aktion.pfad);
  const ordner = aktion.art === "ordner_anlegen";
  const res = await v.fetch(ordner ? url(v, "/api/v1/folders") : url(v, `/api/v3/secrets/raw/${encodeURIComponent(aktion.name)}`), {
    method: "POST",
    headers: kopf(v),
    body: JSON.stringify(
      ordner
        ? { workspaceId: v.projektId, environment: aktion.environment, name, path: eltern }
        : { workspaceId: v.projektId, environment: aktion.environment, secretPath: aktion.pfad, secretValue: "", type: "shared" },
    ),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 409) return "vorhanden";
  if (!res.ok) throw new InfisicalFehler(res.status, ordner ? `Ordner ${aktion.pfad} anlegen` : `${aktion.name} anlegen`);
  return "angelegt";
}
