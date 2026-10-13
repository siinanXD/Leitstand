/** Kosten-Block „Was kostet das?“ (SIN-527): rein, ohne Netz. Quellen, die fehlen, sind „nicht verfügbar“, nie geschätzt. */

/** Ein Betrag in Euro an einem Tag (`tag` als YYYY-MM-DD, Berliner Zeit bzw. UTC-Tag bei Langfuse). */
export type Posten = { tag: string; art: string; eur: number };

/** Eine Quelle: Posten oder null, wenn sie nicht erreichbar ist. */
export type Quelle = Posten[] | null;

export type Quellen = { pipeline: Quelle; werbemittel: Quelle; langfuse: Quelle };

export type Ampel = "gruen" | "gelb" | "rot";

export type Zeile = { art: string; heute: number | null; monat: number | null; verfuegbar: boolean };

export type Kosten = {
  heute: number | null;
  monat: number | null;
  budget: number;
  /** Die letzten 7 Tage (SIN-555) gegen den Wochendeckel; null ohne Zahlen. */
  woche: number | null;
  wochenDeckel: number;
  /** Monatsverbrauch / Budget (0 bis ∞), null ohne Zahlen. */
  anteil: number | null;
  ampel: Ampel | null;
  zeilen: Zeile[];
  /** Quellen, die nicht erreichbar waren. */
  nichtVerfuegbar: string[];
  hinweis: string;
};

export const STANDARD_BUDGET_EUR = 100;
export const STANDARD_WOCHEN_DECKEL_EUR = 60;
export const HINWEIS = "Abos nicht enthalten";
export const ALARM_ANTEIL = 0.2;

export const ART_PIPELINE = "Kurs-Inhalte";
export const ART_LANGFUSE = "Agenten (Langfuse)";
export const ART_CLIPS = "Werbeclips";
export const ART_TEXTE = "Werbetexte";
const CLIP_ARTEN = ["werbeclip", "tutorial_video"];

const rund = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const cent = (n: number) => Math.round(n * 100);

/** Budget aus `KOSTEN_BUDGET_EUR`; ungültig oder ≤ 0 ergibt den Standard. */
export function leseBudget(wert: string | undefined): number {
  const n = Number((wert ?? "").replace(",", "."));
  return wert && Number.isFinite(n) && n > 0 ? n : STANDARD_BUDGET_EUR;
}

/** Wochendeckel aus `KOSTEN_WOCHE_EUR`; ungültig oder ≤ 0 ergibt den Standard (60 €). */
export function leseWochenDeckel(wert: string | undefined): number {
  const n = Number((wert ?? "").replace(",", "."));
  return wert && Number.isFinite(n) && n > 0 ? n : STANDARD_WOCHEN_DECKEL_EUR;
}

/** Ampel am Monatsbalken: grün < 70 %, gelb < 90 %, rot darüber. */
export function ampel(anteil: number): Ampel {
  return anteil < 0.7 ? "gruen" : anteil < 0.9 ? "gelb" : "rot";
}

/** Kalendertag (YYYY-MM-DD) in Berliner Zeit. */
export function berlinTag(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Alarm für Push (SIN-426): heute mehr als 20 % des Monatsbudgets. */
export const kostenAlarm = (heute: number | null, budget: number): boolean => heute !== null && budget > 0 && heute > budget * ALARM_ANTEIL;

/**
 * Langfuse enthält auch, was schon in `pipeline_run_costs` steht. Das Ledger gewinnt (siehe docs/decisions/SIN-527-kosten.md):
 * je Tag zählt aus Langfuse nur der Rest über dem Ledger-Betrag, nie weniger als 0.
 */
export function ohneDoppelzaehlung(langfuse: Posten[], pipeline: Posten[]): Posten[] {
  const ledger = new Map<string, number>();
  for (const p of pipeline) ledger.set(p.tag, (ledger.get(p.tag) ?? 0) + cent(p.eur));
  const je = new Map<string, number>();
  for (const p of langfuse) je.set(p.tag, (je.get(p.tag) ?? 0) + cent(p.eur));
  return [...je].map(([tag, c]) => ({ tag, art: ART_LANGFUSE, eur: Math.max(0, c - (ledger.get(tag) ?? 0)) / 100 })).filter((p) => p.eur > 0);
}

function zeile(art: string, posten: Posten[], heute: string, monat: string): Zeile {
  const summe = (f: (p: Posten) => boolean) => rund(posten.filter(f).reduce((s, p) => s + cent(p.eur), 0) / 100);
  return { art, heute: summe((p) => p.tag === heute), monat: summe((p) => p.tag.startsWith(monat)), verfuegbar: true };
}

/** Führt die Quellen je Kostenart zusammen. Euro mit 2 Stellen; fehlende Quelle bleibt sichtbar als nicht verfügbar. */
export function zusammenfuehren(q: Quellen, budget = STANDARD_BUDGET_EUR, jetzt = new Date(), wochenDeckel = STANDARD_WOCHEN_DECKEL_EUR): Kosten {
  const heute = berlinTag(jetzt);
  const wochenStart = berlinTag(new Date(jetzt.getTime() - 6 * 24 * 3_600_000));
  const letzteWoche: Posten[] = [];
  const monat = heute.slice(0, 7);
  const zeilen: Zeile[] = [];
  const fehlt: string[] = [];

  const gruppiere = (name: string, quelle: Quelle) => {
    if (!quelle) {
      zeilen.push({ art: name, heute: null, monat: null, verfuegbar: false });
      fehlt.push(name);
      return;
    }
    letzteWoche.push(...quelle.filter((p) => p.tag >= wochenStart && p.tag <= heute));
    const arten = [...new Set(quelle.map((p) => p.art))];
    if (arten.length === 0) zeilen.push(zeile(name, [], heute, monat));
    for (const art of arten) zeilen.push(zeile(art, quelle.filter((p) => p.art === art), heute, monat));
  };

  gruppiere(ART_PIPELINE, q.pipeline);
  gruppiere("Werbemittel", q.werbemittel);
  // Ohne Ledger lässt sich Langfuse nicht von dessen Beträgen trennen: dann nicht verfügbar statt doppelt zählen.
  gruppiere(ART_LANGFUSE, q.langfuse && q.pipeline ? ohneDoppelzaehlung(q.langfuse, q.pipeline) : null);

  const echte = zeilen.filter((z) => z.verfuegbar);
  const summe = (f: (z: Zeile) => number | null) => (echte.length ? rund(echte.reduce((s, z) => s + cent(f(z) ?? 0), 0) / 100) : null);
  const m = summe((z) => z.monat);
  const anteil = m === null ? null : m / budget;
  const woche = echte.length ? rund(letzteWoche.reduce((s, p) => s + cent(p.eur), 0) / 100) : null;
  return { heute: summe((z) => z.heute), monat: m, woche, wochenDeckel, budget, anteil, ampel: anteil === null ? null : ampel(anteil), zeilen, nichtVerfuegbar: fehlt, hinweis: HINWEIS };
}

const zahl = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const tagAus = (v: unknown): string | null => {
  const d = typeof v === "string" ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? berlinTag(d) : null;
};

/** `pipeline_run_costs`: `created_at`, `cost_eur`. Zeilen ohne Betrag oder Datum fallen weg. */
export function lesePipeline(zeilen: unknown): Posten[] {
  if (!Array.isArray(zeilen)) return [];
  return zeilen.flatMap((z: Record<string, unknown>) => {
    const eur = zahl(z?.cost_eur);
    const tag = tagAus(z?.created_at);
    return eur === null || !tag ? [] : [{ tag, art: ART_PIPELINE, eur }];
  });
}

/** `werbemittel`: `created_at`, `kosten_eur`, `art`. Clips und Texte getrennt. */
export function leseWerbemittel(zeilen: unknown): Posten[] {
  if (!Array.isArray(zeilen)) return [];
  return zeilen.flatMap((z: Record<string, unknown>) => {
    const eur = zahl(z?.kosten_eur);
    const tag = tagAus(z?.created_at);
    return eur === null || !tag ? [] : [{ tag, art: CLIP_ARTEN.includes(String(z.art)) ? ART_CLIPS : ART_TEXTE, eur }];
  });
}

/** Langfuse Daily Metrics (`data[].date`, `data[].totalCost` in USD) → Euro. Ohne Kurs null (nicht schätzen). */
export function leseLangfuse(seiten: unknown[], usdZuEur: number | null): Quelle {
  if (usdZuEur === null || !(usdZuEur > 0)) return null;
  return seiten.flatMap((s) => {
    const daten = (s as { data?: unknown })?.data;
    return Array.isArray(daten)
      ? daten.flatMap((t: Record<string, unknown>) => {
          const usd = zahl(t?.totalCost);
          const tag = typeof t?.date === "string" ? t.date.slice(0, 10) : null;
          return usd === null || !tag ? [] : [{ tag, art: ART_LANGFUSE, eur: rund(usd * usdZuEur) }];
        })
      : [];
  });
}
