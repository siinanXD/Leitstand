// Prüfer-Beleg für Produkt-Gates (SIN-939). pr-gate.yml der Lern-App lädt diese Datei und beleg-stand.mjs von Leitstand-main
// und lässt nur mergen, wenn der Leitstand-Prüfer den aktuellen Head gegen die aktuellen Fertig-Kriterien bestanden hat.
// Rein, ohne Netz; dieselbe Regel wie automerge.yml im Leitstand. Tests: src/lib/pruefer/produkt.test.ts.
import { belegAktuell, leseStand } from "../loop/beleg-stand.mjs";

/** kommentare: GitHub-Issue-Kommentare des PR; nur Kommentare der Absender (Repo-Owner, github-actions[bot]) zählen. */
export function prueferBeleg({ kommentare, headSha, hash, absender }) {
  const eigene = kommentare.filter((k) => absender.includes(k.user?.login)).map((k) => k.body || "");
  return belegAktuell({ stand: leseStand(eigene), headSha, hash });
}
