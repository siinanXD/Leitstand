"use client";

import { useState } from "react";
import { abhaengigkeiten } from "@/lib/ablauf";
import { projektInfo } from "@/lib/projekte";
import type { Quelle } from "@/lib/uebersicht";
import { ProjektFilter, Rahmen, projekteIn } from "../rahmen";

function Abhaengigkeiten({ quelle }: { quelle: Quelle }) {
  const [filter, setFilter] = useState<string | null>(null);
  // Spalten und kritischer Pfad über alle Projekte rechnen, erst danach filtern (Blocker können projektübergreifend sein).
  const alle = abhaengigkeiten(quelle.snapshot);
  const knoten = filter ? alle.filter((k) => k.project === filter) : alle;
  const spalten = Math.max(-1, ...knoten.map((k) => k.spalte)) + 1;

  return (
    <main className="seite">
      <section className="tile" aria-labelledby="dep-titel">
        <h1 id="dep-titel" className="mono-label">
          Abhängigkeiten
        </h1>
        <ProjektFilter projekte={projekteIn(quelle)} wert={filter} onChange={setFilter} />
        {knoten.length === 0 ? (
          <p className="leer">Keine Daten</p>
        ) : (
          <>
            <p className="leer">Spalte 1 hat keine Blocker; jede weitere Spalte wartet auf die davor. Kritischer Pfad = längste Blocker-Kette.</p>
            <div className="spalten" style={{ gridTemplateColumns: `repeat(${spalten}, minmax(220px, 1fr))` }}>
              {Array.from({ length: spalten }, (_, s) => (
                <ol key={s} className="liste" aria-label={`Spalte ${s + 1}`}>
                  {knoten
                    .filter((k) => k.spalte === s)
                    .map((k) => (
                      <li key={k.issue} className={`dep${k.kritisch ? " kritisch" : ""}`} style={{ borderLeft: `4px solid ${projektInfo(k.project).farbe}` }}>
                        <span className="mono">{k.issue}</span> {k.titel}
                        <br />
                        <span className="mono-label">
                          {projektInfo(k.project).name}
                          {k.kritisch && " · kritischer Pfad"}
                          {k.brauchtDich && " · braucht dich"}
                        </span>
                        {k.blockiert.length > 0 && (
                          <>
                            <br />
                            <span className="mono-label">blockiert durch {k.blockiert.join(", ")}</span>
                          </>
                        )}
                      </li>
                    ))}
                </ol>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default function AbhaengigkeitenSeite() {
  return <Rahmen aktiv="abhaengigkeiten">{(quelle) => <Abhaengigkeiten quelle={quelle} />}</Rahmen>;
}
