// SIN-572: `docs/FERTIG.md` als Checkliste lesen. Rein, kein Netz. Zeilen `- [x] Titel` sind fertig, `- [ ] Titel` offen.
const PUNKT = /^\s*[-*]\s+\[([ xX])\]\s+(.+?)\s*$/;

function punkte(md: string) {
  return md.split("\n").flatMap((z) => {
    const m = PUNKT.exec(z);
    return m ? [{ fertig: m[1] !== " ", titel: m[2] }] : [];
  });
}

/** Gezählte Haken für `loop_snapshot.progress`. Ohne Punkte: null (nichts raten). */
export function zaehleHaken(md: string): { fertig: number; gesamt: number } | null {
  const p = punkte(md);
  return p.length ? { fertig: p.filter((x) => x.fertig).length, gesamt: p.length } : null;
}

const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();

/** Bis zu `n` offene Punkte, die noch kein offenes Issue mit gleichem Titel haben (Groß-/Kleinschreibung egal). Nie doppelt. */
export function neueIssueTitel(md: string, vorhandeneTitel: string[], n: number): string[] {
  const gesehen = new Set(vorhandeneTitel.map(norm));
  const neu: string[] = [];
  for (const p of punkte(md)) {
    if (p.fertig || gesehen.has(norm(p.titel)) || neu.length >= n) continue;
    gesehen.add(norm(p.titel));
    neu.push(p.titel);
  }
  return neu;
}
