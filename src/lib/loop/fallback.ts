/** SIN-832: vorbereitete Fallback-Policy, kein ausführender Codex-Adapter.
 * Linear bleibt Warteschlange. Start erst nach atomarer Reservierung im angebundenen Speicher.
 * Ein fehlender Commit/Timeout beweist nie das Ende eines Workers.
 */
import { istLimitMeldung, resetAusLog } from "../kontingent/kontingent";

export type Provider = "claude" | "codex";
export type Fehlerklasse = "kontingent" | "auth" | "netz" | "verbindung" | "fachlich" | "unbekannt";
export type ProviderStand = { adapter: boolean; fehler: Fehlerklasse | null; bis: string | null; versuche: number };
export type Auftrag = {
  issue: string; pr: number | null; branch: string | null; revision: number;
  worker: { provider: Provider; claim: string } | null;
  reparaturen: number; codexGeeignet: boolean;
};
export type Ereignis = {
  issue: string; pr: number | null; branch: string | null; provider: Provider | null;
  fehlerklasse: Fehlerklasse | null; status: "startbereit" | "wartend" | "aktiv" | "needs-human";
  zeitstempel: string; nachweise: string[];
};

/** Rohtext nur klassifizieren, niemals in Ereignisse, Kommentare oder Artefakte übernehmen. */
export function fehlerklasse(f: { status?: number; text?: string; fachlich?: boolean }): Fehlerklasse {
  if (f.fachlich) return "fachlich";
  if (f.status === 401 || f.status === 403) return "auth";
  const text = f.text ?? "";
  if (/authentication_error|invalid_api_key|unauthorized|token expired/i.test(text)) return "auth";
  if (/create an environment for this repo/i.test(text)) return "verbindung";
  if (f.status === 429 || istLimitMeldung(text)) return "kontingent";
  if ((f.status !== undefined && f.status >= 500) || /ECONNRESET|ETIMEDOUT|ENOTFOUND|network error|fetch failed/i.test(text)) return "netz";
  return "unbekannt";
}

/** Höchstens zwei Wiederholungen nach initialem Ausfall. Auth/Verbindung/unklar brauchen neue Belege. */
export function nachFehler(stand: ProviderStand, klasse: Fehlerklasse, jetzt: Date, log = ""): ProviderStand {
  if (klasse === "fachlich") return { ...stand };
  const versuche = stand.versuche + 1;
  const wiederholbar = versuche <= 2 && (klasse === "kontingent" || klasse === "netz");
  const reset = klasse === "kontingent" ? resetAusLog(log, jetzt) : null;
  const bis = wiederholbar ? (reset ?? new Date(jetzt.getTime() + (klasse === "kontingent" ? 300 : 15 * versuche) * 60_000)).toISOString() : null;
  return { ...stand, fehler: klasse, bis, versuche };
}

const natuerlich = (n: number) => Number.isSafeInteger(n) && n >= 0;
const verfuegbar = (s: ProviderStand, jetzt: Date) =>
  s.adapter && natuerlich(s.versuche) && (s.fehler === null ||
    ((s.fehler === "kontingent" || s.fehler === "netz") && s.versuche <= 2 && s.bis !== null && Date.parse(s.bis) <= jetzt.getTime()));

/** Nur kanonische Belegadressen übernehmen; insbesondere keine Query-Tokens oder fremden Hosts. */
function nachweise(links: string[]): string[] {
  return [...new Set(links.filter((link) => /^https:\/\/github\.com\/siinanXD\/Leitstand\/(?:actions\/runs\/\d+|pull\/\d+|commit\/[a-f0-9]{40})(?:#[a-zA-Z0-9_-]+)?$/.test(link)))];
}

export function planeFallback(a: Auftrag, staende: Record<Provider, ProviderStand>, jetzt: Date, links: string[]): Ereignis {
  if (!/^SIN-\d+$/.test(a.issue) || !natuerlich(a.reparaturen) || !natuerlich(a.revision) ||
      (a.pr !== null && (!Number.isSafeInteger(a.pr) || a.pr <= 0)) || !Number.isFinite(jetzt.getTime())) throw new Error("Fallback-Auftrag ungültig");
  const e: Ereignis = { issue: a.issue, pr: a.pr, branch: a.branch, provider: a.worker?.provider ?? null,
    fehlerklasse: null, status: "wartend", zeitstempel: jetzt.toISOString(), nachweise: nachweise(links) };
  if (a.worker) return { ...e, status: "aktiv" };
  if (a.reparaturen >= 2) return { ...e, status: "needs-human", fehlerklasse: "fachlich" };
  for (const provider of ["claude", "codex"] as const) {
    if (provider === "codex" && !a.codexGeeignet) continue;
    if (verfuegbar(staende[provider], jetzt)) return { ...e, provider, status: "startbereit" };
  }
  return { ...e, fehlerklasse: staende.claude.fehler ?? staende.codex.fehler };
}

/** Wie beim Lauf-Vertrag: dauerhafter Compare-and-swap, nicht bloß ein lesbarer Claim-Kommentar.
 * Implementierung muss revision atomar vergleichen, PR/Branch erhalten und vor Start bestätigen.
 * Kein Produktionsadapter vorhanden; ein Test-Speicher ist kein Live-Nachweis.
 */
export type Speicher = { tausche(issue: string, revision: number, neu: Auftrag): Promise<boolean> };

export async function reserviere(a: Auftrag, e: Ereignis, claim: string, speicher: Speicher): Promise<boolean> {
  if (e.status !== "startbereit" || !e.provider || a.worker || !natuerlich(a.reparaturen) || a.reparaturen >= 2 ||
      !natuerlich(a.revision) || !/^SIN-\d+$/.test(a.issue) || !/^[A-Za-z0-9_-]{1,100}$/.test(claim) ||
      (e.provider === "codex" && !a.codexGeeignet) ||
      e.issue !== a.issue || e.pr !== a.pr || e.branch !== a.branch) return false;
  try {
    return await speicher.tausche(a.issue, a.revision, { ...a, revision: a.revision + 1, worker: { provider: e.provider, claim } });
  } catch {
    return false;
  }
}
