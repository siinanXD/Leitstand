/**
 * SIN-905: Im PR nur die Tests, die von den geänderten Dateien abhängen. Rein, ohne Dateizugriff:
 * der Aufrufer liefert die Importe je Datei. Unklare Fälle führen immer zur vollen Testreihe.
 */
import { dirname, join, normalize } from "node:path";

export type Importe = Record<string, string[]>;

const ENDUNGEN = [".ts", ".tsx", ".mts", ".mjs", ".js", ".json", "/index.ts", "/index.tsx"];

/** Rohe Importpfade aus dem Quelltext (statisch, dynamisch, Re-Export). */
export const importPfade = (quelle: string): string[] => {
  const treffer = new Set<string>();
  const muster = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;
  for (const m of quelle.matchAll(muster)) treffer.add(m[1]);
  return [...treffer];
};

/** Löst einen Importpfad zu einer Repo-Datei auf (`@/` = `src/`, sonst relativ zur Importdatei); Pakete → null. */
export const loeseAuf = (von: string, pfad: string, dateien: ReadonlySet<string>): string | null => {
  let basis: string;
  if (pfad.startsWith("@/")) basis = join("src", pfad.slice(2));
  else if (pfad.startsWith(".")) basis = join(dirname(von), pfad);
  else return null;
  basis = normalize(basis).replaceAll("\\", "/");
  if (dateien.has(basis)) return basis;
  // `./x.js` verweist im TS-Quelltext oft auf `x.ts`
  const ohne = basis.replace(/\.m?js$/, "");
  for (const e of ENDUNGEN) {
    if (dateien.has(basis + e)) return basis + e;
    if (dateien.has(ohne + e)) return ohne + e;
  }
  return null;
};

export const istTest = (datei: string) => /\.test\.tsx?$/.test(datei);

/** Dateien, die alle Tests beeinflussen können, ohne importiert zu werden. */
const GLOBAL = [/^package(-lock)?\.json$/, /^tsconfig.*\.json$/, /^\.github\/workflows\/build\.yml$/, /^scripts\/ci\//, /^src\/lib\/ci\//];

export type Auswahl = { alle: boolean; grund: string; tests: string[] };

/** Tests, die eine geänderte Datei erreichen (Test selbst oder transitiv importiert). */
export const betroffeneTests = (geaendert: readonly string[], importe: Importe, dateien: ReadonlySet<string>): Auswahl => {
  const global = geaendert.find(d => GLOBAL.some(g => g.test(d)));
  if (global) return { alle: true, grund: `${global} wirkt auf alle Tests`, tests: [] };

  // Rückwärtskanten: Datei → wer sie importiert
  const rueck = new Map<string, Set<string>>();
  for (const [von, ziele] of Object.entries(importe)) {
    for (const p of ziele) {
      const ziel = loeseAuf(von, p, dateien);
      if (!ziel) continue;
      if (!rueck.has(ziel)) rueck.set(ziel, new Set());
      rueck.get(ziel)!.add(von);
    }
  }

  const besucht = new Set<string>();
  const stapel = geaendert.filter(d => dateien.has(d));
  while (stapel.length) {
    const d = stapel.pop()!;
    if (besucht.has(d)) continue;
    besucht.add(d);
    for (const v of rueck.get(d) ?? []) stapel.push(v);
  }
  const tests = [...besucht].filter(istTest).sort();
  return { alle: false, grund: `${tests.length} Test(s) erreichen ${geaendert.length} geänderte Datei(en)`, tests };
};
