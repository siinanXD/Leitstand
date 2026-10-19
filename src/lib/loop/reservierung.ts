/**
 * SIN-832: dauerhafte issueweite Reservierung für den Speichervertrag aus `fallback.ts`.
 * Speicher ist die vorhandene Tabelle `leitstand_aufgaben` (Zeile je Linear-Issue, Migration 20261019200000).
 * Compare-and-swap: ein `UPDATE … WHERE issue = … AND claim_revision = <alt>` über PostgREST; Postgres führt es atomar aus,
 * nur ein Schreiber bekommt die Zeile zurück. Fehlt die Zeile, legt der erste Start sie an (Primärschlüssel: ein Gewinner).
 * Jeder Netz- oder HTTP-Fehler wirft; `reserviere` macht daraus „kein Start“.
 */
import type { Auftrag, Provider, Speicher } from "./fallback";

export const TABELLE = "leitstand_aufgaben";
export const SPALTEN = "issue,claim_revision,claim_provider,claim_id,claim_at,reparaturen,claim_nachweis";
/** Ohne PR und ohne laufenden Worker gilt ein Claim erst nach so vielen Stunden als verwaist (gleich wie der Wächter, SIN-419). */
export const VERWAIST_STUNDEN = 6;

export type Reservierung = {
  issue: string;
  revision: number;
  provider: Provider | null;
  claim: string | null;
  seit: string | null;
  reparaturen: number;
  nachweis: string | null;
};

type Zeile = {
  issue: string;
  claim_revision?: number | null;
  claim_provider?: string | null;
  claim_id?: string | null;
  claim_at?: string | null;
  reparaturen?: number | null;
  claim_nachweis?: string | null;
};

const ISSUE = /^SIN-\d+$/;
/** Nur Belege aus den eigenen Repos; keine Query-Strings (Tokens), keine fremden Hosts. */
const NACHWEIS = /^https:\/\/github\.com\/siinanXD\/[A-Za-z0-9_.-]+\/(?:pull\/\d+|issues\/\d+|actions\/runs\/\d+|commit\/[a-f0-9]{40})(?:#[A-Za-z0-9_-]+)?$/;

export const istNachweis = (link: string) => NACHWEIS.test(link);

export function ausZeile(issue: string, z: Zeile | undefined): Reservierung {
  const provider = z?.claim_provider === "claude" || z?.claim_provider === "codex" ? z.claim_provider : null;
  return {
    issue,
    revision: z?.claim_revision ?? 0,
    provider: provider && z?.claim_id ? provider : null,
    claim: provider && z?.claim_id ? z.claim_id : null,
    seit: z?.claim_at ?? null,
    reparaturen: z?.reparaturen ?? 0,
    nachweis: z?.claim_nachweis ?? null,
  };
}

/** Speicherstand plus Kontext aus dem Aufrufer (PR, Branch, Eignung) als `Auftrag` für `planeFallback`. */
export function auftragAus(r: Reservierung, k: { pr: number | null; branch: string | null; codexGeeignet: boolean; codexZuerst?: boolean }): Auftrag {
  return {
    codexZuerst: k.codexZuerst,
    issue: r.issue,
    pr: k.pr,
    branch: k.branch,
    revision: r.revision,
    worker: r.provider && r.claim ? { provider: r.provider, claim: r.claim } : null,
    reparaturen: r.reparaturen,
    codexGeeignet: k.codexGeeignet,
  };
}

/**
 * Darf der Wächter einen Claim freigeben? Nur mit Beleg, nie bloß wegen Zeitablauf: kein offener PR, kein offener
 * GitHub-Spiegel, kein laufender oder wartender Worker-Lauf im Repo und Claim älter als VERWAIST_STUNDEN.
 * Ist der Worker-Zustand unbekannt (`workerLaeuft === null`), bleibt der Claim.
 */
export function verwaist(r: Reservierung, lage: { offenerPr: boolean; gespiegelt: boolean; workerLaeuft: boolean | null; jetzt: Date }): boolean {
  if (!r.claim || !r.seit) return false;
  if (lage.offenerPr || lage.gespiegelt || lage.workerLaeuft !== false) return false;
  return lage.jetzt.getTime() - Date.parse(r.seit) >= VERWAIST_STUNDEN * 3_600_000;
}

/** Belegt das Issue keinen Startplatz? Aktiver Claim oder ausgeschöpfte Reparaturen (SIN-832, Befund: sonst steht die Schlange). */
export const blockiert = (r: Reservierung, max: number) => !!r.claim || r.reparaturen >= max;

export type ReservierungsSpeicher = Speicher & {
  laden(issue: string): Promise<Reservierung>;
  /** Gespeicherter Stand der genannten Issues (alle Zeilen, auch ohne Claim); fehlende Zeilen fehlen in der Liste. */
  staende(issues: string[]): Promise<Reservierung[]>;
  /**
   * Claim beenden; nur mit Beleg (Merge-PR, Stopp-Kommentar, Wächter-Lauf). Der Reparaturzähler bleibt stehen, außer
   * `erfolg`: nach einem Merge waren die Runden davor nicht erfolglos, der nächste PR des Issues beginnt bei null.
   */
  freigeben(r: Reservierung, nachweis: string, erfolg?: boolean): Promise<boolean>;
  /** Eine Reparaturrunde issueweit zählen, egal welcher Provider repariert. Fehlt die Zeile, wird sie mit `titel` angelegt. */
  zaehleReparatur(r: Reservierung, titel?: string): Promise<boolean>;
};

type Konfig = {
  url: string;
  key: string;
  /** Titel für eine noch fehlende Zeile (Pflichtspalte); ohne Titel wird nicht angelegt, der Start unterbleibt. */
  titel?: (issue: string) => string | undefined;
  jetzt?: () => Date;
  fetch?: typeof fetch;
};

export function supabaseReservierung(k: Konfig): ReservierungsSpeicher {
  const holen = k.fetch ?? fetch;
  const jetzt = k.jetzt ?? (() => new Date());
  const basis = `${k.url.replace(/\/$/, "")}/rest/v1/${TABELLE}`;
  const kopf = { apikey: k.key, Authorization: `Bearer ${k.key}`, "Content-Type": "application/json" };

  const anfrage = async (pfad: string, init: RequestInit): Promise<Zeile[]> => {
    const res = await holen(`${basis}${pfad}`, { ...init, headers: { ...kopf, ...(init.headers as Record<string, string>) }, signal: AbortSignal.timeout(15_000) });
    // Rohtext nicht weitergeben: kann Schema- oder Konfigurationsdetails enthalten.
    if (!res.ok) throw new Error(res.status === 400 ? "Reservierung: HTTP 400 (Spalten claim_* fehlen? Migration 20261019200000 bzw. Lern-App #433 prüfen)" : `Reservierung: HTTP ${res.status}`);
    const daten = (await res.json()) as unknown;
    if (!Array.isArray(daten)) throw new Error("Reservierung: unerwartete Antwort");
    return daten as Zeile[];
  };

  const pruefeIssue = (issue: string) => {
    if (!ISSUE.test(issue)) throw new Error("Reservierung: ungültige Issue-Kennung");
  };

  /** Bedingtes Update: genau eine Zeile zurück heißt gewonnen. */
  const cas = async (issue: string, revision: number, felder: Partial<Zeile>): Promise<boolean> => {
    pruefeIssue(issue);
    if (!Number.isSafeInteger(revision) || revision < 0) return false;
    const zeilen = await anfrage(`?issue=eq.${encodeURIComponent(issue)}&claim_revision=eq.${revision}&select=${SPALTEN}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...felder, claim_revision: revision + 1 }),
    });
    return zeilen.length === 1;
  };

  return {
    async laden(issue) {
      pruefeIssue(issue);
      const zeilen = await anfrage(`?issue=eq.${encodeURIComponent(issue)}&select=${SPALTEN}`, { method: "GET" });
      return ausZeile(issue, zeilen[0]);
    },

    async staende(issues) {
      const ids = [...new Set(issues)];
      ids.forEach(pruefeIssue);
      if (!ids.length) return [];
      const zeilen = await anfrage(`?issue=in.(${ids.map(encodeURIComponent).join(",")})&select=${SPALTEN}`, { method: "GET" });
      return zeilen.map((z) => ausZeile(z.issue, z));
    },

    async tausche(issue, revision, neu) {
      if (neu.issue !== issue || neu.revision !== revision + 1) return false;
      const felder: Partial<Zeile> = {
        claim_provider: neu.worker?.provider ?? null,
        claim_id: neu.worker?.claim ?? null,
        claim_at: neu.worker ? jetzt().toISOString() : null,
        reparaturen: neu.reparaturen,
        claim_nachweis: null,
      };
      if (await cas(issue, revision, felder)) return true;
      if (revision !== 0) return false;
      // Zeile fehlt noch (Aufgaben-Spiegel lief noch nicht): anlegen; ein paralleles Anlegen verliert am Primärschlüssel.
      const titel = k.titel?.(issue);
      if (!titel) return false;
      const zeilen = await anfrage(`?select=${SPALTEN}`, {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify({ issue, titel, status: "laeuft", labels: [], ...felder, claim_revision: 1 }),
      });
      return zeilen.length === 1;
    },

    async freigeben(r, nachweis, erfolg = false) {
      if (!istNachweis(nachweis) || (!r.claim && !(erfolg && r.reparaturen > 0))) return false;
      return cas(r.issue, r.revision, { claim_provider: null, claim_id: null, claim_at: null, claim_nachweis: nachweis, ...(erfolg ? { reparaturen: 0 } : {}) });
    },

    async zaehleReparatur(r, titel) {
      if (await cas(r.issue, r.revision, { reparaturen: r.reparaturen + 1 })) return true;
      if (r.revision !== 0 || !titel) return false;
      // Zeile fehlt (Spiegel lief nicht, PR ohne Dispatcher-Start): mit erster Runde anlegen, ein Gewinner.
      const zeilen = await anfrage(`?select=${SPALTEN}`, {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify({ issue: r.issue, titel, status: "laeuft", labels: [], claim_revision: 1, reparaturen: r.reparaturen + 1 }),
      });
      return zeilen.length === 1;
    },
  };
}
