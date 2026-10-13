import type { Quelle } from "@/lib/uebersicht";
import { heuteFertig } from "@/lib/uebersicht-einfach";

/** „Heute fertig geworden“ (früher auf dem Start, SIN-568): in einfachen Worten, was jetzt anders ist. */
export function HeuteFertig({ quelle, jetzt }: { quelle: Quelle; jetzt: Date }) {
  const liste = heuteFertig(quelle, jetzt);
  return (
    <section className="tile einfach-block" aria-labelledby="fertig">
      <div className="kopf-block">
        <h2 id="fertig" className="mono-label">
          Zuletzt geschafft
        </h2>
        <p className="leer">Heute fertig geworden, in einfachen Worten.</p>
      </div>
      {liste.length === 0 ? (
        <p className="leer">Heute noch nichts fertig.</p>
      ) : (
        <ul className="posten">
          {liste.map((f) => (
            <li key={f.key} className="zeile">
              <span>{f.satz}</span>
              <span className="mono">{f.zeit}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
