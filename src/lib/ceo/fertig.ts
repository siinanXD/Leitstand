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

/** Höchstens so viele neue Ideen-Issues je Projekt und Lauf (SIN-613). */
export const MAX_NEU_JE_LAUF = 3;

const FUELL = new Set(["der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "und", "oder", "für", "von", "mit", "im", "in", "zu", "zum", "zur", "auf", "als", "bei", "nach", "vor", "je", "the", "and", "for"]);
const woerter = (t: string) => new Set(norm(t).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !FUELL.has(w)).map((w) => w.slice(0, 6)));

/**
 * Gleiche Absicht trotz anderem Titel: gleicher Titel, oder mindestens 60 % der Stichwörter des kürzeren Titels stehen im anderen (Wortanfang, 6 Zeichen).
 * shortcut: nur Titel, nicht das Ziel im Text; bei Fehlgriffen die Beschreibung einbeziehen.
 */
export function gleicheAbsicht(a: string, b: string): boolean {
  if (norm(a) === norm(b)) return true;
  const x = woerter(a);
  const y = woerter(b);
  const kurz = x.size <= y.size ? x : y;
  const lang = kurz === x ? y : x;
  return kurz.size >= 2 && [...kurz].filter((w) => lang.has(w)).length / kurz.size >= 0.6;
}

/** Bis zu `n` (höchstens MAX_NEU_JE_LAUF) offene Punkte ohne Issue gleicher Absicht; Treffer landen in `uebersprungen` mit dem vorhandenen Titel. Nie doppelt. */
export function pruefeDubletten(md: string, vorhandeneTitel: string[], n: number): { neu: string[]; uebersprungen: { titel: string; vorhanden: string }[] } {
  const bekannt = [...vorhandeneTitel];
  const neu: string[] = [];
  const uebersprungen: { titel: string; vorhanden: string }[] = [];
  const max = Math.min(n, MAX_NEU_JE_LAUF);
  for (const p of punkte(md)) {
    if (p.fertig || neu.length >= max) continue;
    const treffer = bekannt.find((t) => gleicheAbsicht(t, p.titel));
    if (treffer) uebersprungen.push({ titel: p.titel, vorhanden: treffer });
    else {
      bekannt.push(p.titel);
      neu.push(p.titel);
    }
  }
  return { neu, uebersprungen };
}

/** Bis zu `n` offene Punkte, die noch kein Issue gleicher Absicht haben. */
export const neueIssueTitel = (md: string, vorhandeneTitel: string[], n: number): string[] => pruefeDubletten(md, vorhandeneTitel, n).neu;
