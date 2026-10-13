import type { Quelle } from "@/lib/uebersicht";
import { heuteFertig } from "@/lib/uebersicht-einfach";
import { ohneKennungen, zeitInWorten } from "@/lib/zeit";
import { MitMehr } from "./mit-mehr";
import { ZustandSymbol } from "./zustand-symbol";

/** „Zuletzt geschafft“ (SIN-578): heute fertig geworden, in einfachen Worten, mit der Zeit in Worten. */
export function HeuteFertig({ quelle, jetzt }: { quelle: Quelle; jetzt: Date }) {
  const liste = heuteFertig(quelle, jetzt);
  return (
    <section className="tile einfach-block blau" aria-labelledby="fertig">
      <h2 id="fertig" className="karte-titel">
        Zuletzt geschafft
      </h2>
      <ZustandSymbol art="fertig" />
      {liste.length === 0 ? (
        <p className="leer">Heute noch nichts fertig.</p>
      ) : (
        <MitMehr
          liste={liste}
          klasse="posten"
          zeile={(f) => (
            <li key={f.key} className="dienst-schmal">
              <span>{ohneKennungen(f.satz)}</span>
              <span className="leer">{zeitInWorten(f.zeit, jetzt)}</span>
            </li>
          )}
        />
      )}
    </section>
  );
}
