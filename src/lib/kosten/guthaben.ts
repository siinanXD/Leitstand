/** Guthaben je Dienst und Warnungen (SIN-555): rein, ohne Netz. Quelle ist `loop_snapshot.guthaben`, nichts wird erfunden. */

export type GuthabenQuelle = "api" | "gerechnet" | "schaetzung";

/** `wert` ist das, was übrig ist, `gesamt` die Einzahlung bzw. das Limit (beide in `einheit`). */
export type Guthaben = { dienst: string; wert: number; gesamt: number; einheit: string; quelle: GuthabenQuelle; aktualisiert: string | null; link: string | null };

export type Warnung = { key: string; titel: string; warum: string; link: string | null };

export const GUTHABEN_UNTER = 0.2;
export const KONTINGENT_UEBER = 0.8;

const QUELLEN: GuthabenQuelle[] = ["api", "gerechnet", "schaetzung"];
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const zahl = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
/** Nur http(s): der Link wird als Knopf gezeigt. */
const https = (v: unknown): string | null => {
  const t = text(v);
  return t && /^https?:\/\//.test(t) ? t : null;
};

/**
 * Spalte `guthaben` als Liste [{dienst, wert, gesamt, einheit, quelle, aktualisiert, link}] oder Objekt {dienst: {...}}; Text wird als JSON gelesen.
 * Einträge ohne gültige Zahlen oder ohne bekannte `quelle` fallen weg (nichts raten).
 */
export function parseGuthaben(raw: unknown): Guthaben[] {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  const o = obj(v);
  const eintraege: [string | null, unknown][] = Array.isArray(v) ? v.map((x) => [text(obj(x)?.dienst ?? obj(x)?.name), x]) : o ? Object.entries(o) : [];
  return eintraege.flatMap(([dienst, x]) => {
    const e = obj(x);
    const wert = zahl(e?.wert);
    const gesamt = zahl(e?.gesamt ?? e?.einzahlung);
    const quelle = QUELLEN.find((q) => q === e?.quelle);
    return dienst && e && wert !== null && gesamt !== null && gesamt > 0 && quelle
      ? [{ dienst, wert, gesamt, einheit: text(e.einheit) ?? "€", quelle, aktualisiert: text(e.aktualisiert), link: https(e.link) }]
      : [];
  });
}

/** Anteil, der noch übrig ist (0 bis 1). */
export const restAnteil = (g: Guthaben): number => Math.min(1, Math.max(0, g.wert / g.gesamt));

/** Je Dienst einmal; stehen mehrere Zeilen im Snapshot, gilt die zuletzt aktualisierte. */
export function einzigartig(liste: Guthaben[]): Guthaben[] {
  const je = new Map<string, Guthaben>();
  for (const g of liste) {
    const alt = je.get(g.dienst);
    if (!alt || (g.aktualisiert ?? "") >= (alt.aktualisiert ?? "")) je.set(g.dienst, g);
  }
  return [...je.values()];
}

type Kontingent = { name: string; used: number; limit: number };

/** Rot: Guthaben unter 20 % oder Kontingent über 80 %. Landet auf der Startseite mit „Aufladen“ (nie automatisch zahlen). */
export function warnungen(guthaben: Guthaben[], kontingente: Kontingent[]): Warnung[] {
  const knapp = einzigartig(guthaben)
    .filter((g) => restAnteil(g) < GUTHABEN_UNTER)
    .map<Warnung>((g) => ({ key: `guthaben|${g.dienst}`, titel: `${g.dienst}: Guthaben wird knapp`, warum: `Nur noch ${Math.round(restAnteil(g) * 100)} % übrig${g.quelle === "api" ? "" : g.quelle === "gerechnet" ? " (gerechnet)" : " (Schätzung)"}.`, link: g.link }));
  const voll = kontingente
    .filter((k) => k.limit > 0 && k.used / k.limit > KONTINGENT_UEBER)
    .map<Warnung>((k) => ({ key: `kontingent|${k.name}`, titel: `${k.name}: Kontingent fast aufgebraucht`, warum: `${Math.round((k.used / k.limit) * 100)} % benutzt.`, link: null }));
  return [...knapp, ...voll];
}
