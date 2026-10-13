import { projektInfo } from "@/lib/projekte";
import type { Fortschritt } from "@/lib/uebersicht-einfach";
import { MitMehr } from "./mit-mehr";

export const prozent = (anteil: number) => Math.min(100, Math.round(anteil * 100));

/** Fortschritt als Balken mit Figur am Ende des gefüllten Teils (SIN-578); Text „Name 87 % fertig“. */
export function WieWeit({ liste }: { liste: Fortschritt[] }) {
  if (liste.length === 0) return <p className="leer">Keine Daten</p>;
  return (
    <>
      <p className="leer">Fertig heißt: alles aus der Produktbeschreibung steht.</p>
      <MitMehr
        liste={liste}
        klasse="fortschritt"
        zeile={(f) => {
          const name = projektInfo(f.project).name;
          const p = prozent(f.fertig / f.gesamt);
          return (
            <li key={f.project}>
              <p className="zeile">
                {name} {p} % fertig
              </p>
              <div className="figur-balken">
                <span className="figur" style={{ left: `${p}%` }} aria-hidden="true" />
                <div className="balken" role="img" aria-label={`${name}: ${p} Prozent fertig`}>
                  <div style={{ width: `${p}%` }} />
                </div>
              </div>
            </li>
          );
        }}
      />
    </>
  );
}

/** Kurzfassung für die zweite Zeile einer Karte: das erste Produkt mit Prozent. */
export function fertigZeile(liste: Fortschritt[]) {
  const f = liste.find((x) => x.gesamt > 0);
  return f ? `${projektInfo(f.project).name} ${prozent(f.fertig / f.gesamt)} % fertig` : "Keine Daten";
}
