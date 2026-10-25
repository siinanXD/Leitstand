// Sauberkeits-Tor (SIN-1063): aus der Knip-Ausgabe nur die Funde, die ein PR neu einbringt.
export type KnipFund = { datei: string; name: string; zeile?: number };
type KnipZeile = { name: string; line?: number };
type KnipAusgabe = { issues?: { file: string; files?: unknown[]; exports?: KnipZeile[]; types?: KnipZeile[] }[] };

/** Liest unbenutzte Dateien, Exporte und Typen aus der JSON-Ausgabe von `knip --reporter json`. */
export function leseKnipFunde(ausgabe: KnipAusgabe): KnipFund[] {
  return (ausgabe.issues ?? []).flatMap((i) => [
    ...(i.files?.length ? [{ datei: i.file, name: "(ganze Datei)" }] : []),
    ...[...(i.exports ?? []), ...(i.types ?? [])].map((e) => ({ datei: i.file, name: e.name, zeile: e.line })),
  ]);
}

/** Liest hinzugefügte Zeilennummern je Datei aus `git diff -U0`. */
export function hinzugefuegteZeilen(diff: string): Map<string, Set<number>> {
  const ergebnis = new Map<string, Set<number>>();
  let datei = "";
  for (const zeile of diff.split("\n")) {
    const kopf = /^\+\+\+ b\/(.+)$/.exec(zeile);
    if (kopf) { datei = kopf[1]; ergebnis.set(datei, new Set()); continue; }
    const block = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(zeile);
    if (!block || !datei) continue;
    const start = Number(block[1]);
    for (let n = 0; n < Number(block[2] ?? 1); n++) ergebnis.get(datei)?.add(start + n);
  }
  return ergebnis;
}

/** Behält Funde in neuen Dateien und Exporte/Typen in Zeilen, die der PR hinzufügt; Altfunde bleiben Warnung. */
export function neueFunde(funde: KnipFund[], neueDateien: string[], zeilen: Map<string, Set<number>>): KnipFund[] {
  return funde.filter((f) =>
    f.zeile === undefined ? neueDateien.includes(f.datei) : neueDateien.includes(f.datei) || zeilen.get(f.datei)?.has(f.zeile),
  );
}
