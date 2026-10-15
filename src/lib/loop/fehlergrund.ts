/**
 * Fehlergrund (SIN-617): jeder rote Eintrag in loop_events bekommt `grund` = „<Kategorie>: <erste Fehlerzeile>“.
 * Rein, kein Netz. Genutzt von scripts/loop/loop.ts (Schreiben), dem Lern-Agent und der Kachel „Häufigste Fehlergründe“.
 */

export const KATEGORIEN = ["Kontingent", "Test rot", "Merge-Konflikt", "Zeitüberschreitung", "Rechte fehlen", "Sonstiges"] as const;
export type Kategorie = (typeof KATEGORIEN)[number];

// Reihenfolge zählt: spezifische Muster vor dem allgemeinen „Test rot“.
const MUSTER: [Kategorie, RegExp][] = [
  ["Kontingent", /rate.?limit|quota|usage limit|limit reached|too many requests|\b429\b|overloaded|credit balance|kontingent/i],
  ["Merge-Konflikt", /merge conflict|conflict|not mergeable|mergeable_state|konflikt/i],
  ["Zeitüberschreitung", /timed? ?out|timeout|deadline|exceeded the maximum|cancell?ed|zeitüberschreitung/i],
  ["Rechte fehlen", /permission|forbidden|\b40[13]\b|unauthori[sz]ed|bad credentials|not accessible by integration|resource not accessible|rechte/i],
  ["Test rot", /tests? failed|failing test|✕|\bFAIL\b|typecheck|tsc|eslint|lint|assert|build failed|exit code 1/i],
];

const MAX_ZEILE = 160;

/** Erste nicht leere Zeile ohne Zeitstempel-/Marker-Vorspann, gekürzt. */
export function ersteZeile(text: string): string {
  const zeile =
    text
      .split("\n")
      .map((z) => z.replace(/^\s*(::\w+::|\d{4}-\d\d-\d\dT[\d:.]+Z\s*)/, "").trim())
      .find(Boolean) ?? "";
  return zeile.length > MAX_ZEILE ? `${zeile.slice(0, MAX_ZEILE - 1)}…` : zeile;
}

export function kategorie(text: string): Kategorie {
  return MUSTER.find(([, re]) => re.test(text))?.[0] ?? "Sonstiges";
}

/** `grund` für loop_events aus Fehlertext (Log-Ausschnitt, Fehlermeldung). Leerer Text ergibt trotzdem einen Grund. */
export function fehlergrund(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  return `${kategorie(t)}: ${ersteZeile(t) || "keine Fehlermeldung erfasst"}`;
}

/** Kategorie aus einem gespeicherten `grund`; fehlende oder unbekannte Gründe zählen als „Ohne Grund“. */
export function kategorieAusGrund(grund: string | null | undefined): Kategorie | "Ohne Grund" {
  return KATEGORIEN.find((n) => grund?.startsWith(`${n}:`)) ?? "Ohne Grund";
}

export type FehlerEintrag = { status: string | null; grund: string | null; created_at: string };
export type GrundZahl = { kategorie: Kategorie | "Ohne Grund"; anzahl: number };

/** Top-N-Gründe roter Einträge (`status = fehler`) im Fenster. */
export function topGruende(events: FehlerEintrag[], jetzt: Date, stunden = 24, n = 3): GrundZahl[] {
  const ab = jetzt.getTime() - stunden * 3_600_000;
  const zaehler = new Map<GrundZahl["kategorie"], number>();
  for (const e of events) {
    if (e.status !== "fehler" || new Date(e.created_at).getTime() < ab) continue;
    const k = kategorieAusGrund(e.grund);
    zaehler.set(k, (zaehler.get(k) ?? 0) + 1);
  }
  return [...zaehler]
    .map(([kategorie, anzahl]) => ({ kategorie, anzahl }))
    .sort((a, b) => b.anzahl - a.anzahl || a.kategorie.localeCompare(b.kategorie))
    .slice(0, n);
}
