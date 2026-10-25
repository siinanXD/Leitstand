// Datenbankstruktur (SIN-1037). Rein: die Katalog-Abfrage `leitstand_schema()` liefert den Rohwert, hier wird das Modell daraus.

type Spalte = { name: string; typ: string; nullable: boolean; schluessel: boolean; verweis: string | null };
export type Tabelle = { name: string; rls: boolean; realtime: boolean; policies: string[]; spalten: Spalte[] };

const liste = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null) : []);
const text = (v: unknown) => (typeof v === "string" ? v : "");

/** Tabellen mit Spalten, Schlüsseln, Policy-Namen, RLS und Realtime, nach Name sortiert. Unlesbares wird ausgelassen, nichts geraten. */
export function modell(roh: unknown): Tabelle[] {
  const r = (typeof roh === "object" && roh !== null ? roh : {}) as Record<string, unknown>;
  const realtime = new Set(Array.isArray(r.realtime) ? r.realtime.map(text) : []);
  const schluessel = liste(r.schluessel);
  return liste(r.tabellen)
    .filter((t) => text(t.name) !== "")
    .sort((a, b) => text(a.name).localeCompare(text(b.name), "de"))
    .map((t) => {
      const name = text(t.name);
      const eigene = (k: Record<string, unknown>) => k.tabelle === name;
      const pk = new Set(schluessel.filter((k) => eigene(k) && k.art === "PRIMARY KEY").map((k) => text(k.spalte)));
      const fk = new Map(schluessel.filter((k) => eigene(k) && k.art === "FOREIGN KEY").map((k) => [text(k.spalte), `${text(k.ziel_tabelle)}.${text(k.ziel_spalte)}`]));
      return {
        name,
        rls: t.rls === true,
        realtime: realtime.has(name),
        policies: liste(r.policies).filter(eigene).map((p) => text(p.name)).sort(),
        spalten: liste(r.spalten).filter(eigene).map((s) => ({ name: text(s.name), typ: text(s.typ), nullable: s.null === true, schluessel: pk.has(text(s.name)), verweis: fk.get(text(s.name)) ?? null })),
      };
    });
}
