// Beleg-Stand (SIN-854): Der Prüfer-Kommentar nennt Head-SHA und Hash der Fertig-Kriterien, gegen die geprüft wurde.
// Das Gate (automerge.yml, Logik von main) lässt nur zu, was zum aktuellen Head und Kriterien-Text passt. Rein, ohne Netz.
// Als .mjs, damit automerge.yml es ohne Build laden kann (wie risiko.mjs). Tests: src/lib/loop/beleg-stand.test.ts.
import { createHash } from "node:crypto";

const STAND = /<!-- pruefer-stand:([0-9a-f]{40}):([0-9a-f]{16}) -->/;
const ZEILE = /^\s*[-*]\s+\[[ xX]\]\s+(.+?)\s*$/;

/** Hash über alle Haken (Text, ohne Formatierung und ohne Häkchen-Stand): Umformulieren, Hinzufügen oder Streichen ändert ihn. */
export function kriterienHash(beschreibung) {
  const texte = String(beschreibung ?? "").split("\n").flatMap((z) => {
    const m = ZEILE.exec(z);
    return m ? [m[1].replace(/[`*_]/g, "").replace(/\s+/g, " ").trim().toLowerCase()] : [];
  });
  return createHash("sha256").update(JSON.stringify(texte)).digest("hex").slice(0, 16);
}

export const standMarker = (headSha, hash) => `<!-- pruefer-stand:${headSha.toLowerCase()}:${hash} -->`;

/** Stand aus dem jüngsten Kommentar mit Marker; ohne Marker `null`. */
export function leseStand(kommentare) {
  for (const k of [...kommentare].reverse()) {
    const m = STAND.exec(k);
    if (m) return { sha: m[1], hash: m[2] };
  }
  return null;
}

/** Beleg zählt nur für den aktuellen Head und die aktuellen Kriterien; sonst Grund für den PR-Kommentar. */
export function belegAktuell({ stand, headSha, hash }) {
  if (!stand) return { ok: false, grund: "Kein Prüfer-Beleg mit Stand vorhanden." };
  if (stand.sha !== headSha.toLowerCase()) return { ok: false, grund: `Beleg gehört zu ${stand.sha.slice(0, 7)}, der PR-Head ist ${headSha.slice(0, 7)}: neue Prüfer-Runde nötig.` };
  if (stand.hash !== hash) return { ok: false, grund: "Fertig-Kriterien wurden nach der Prüfung geändert: neue Prüfer-Runde nötig." };
  return { ok: true };
}
