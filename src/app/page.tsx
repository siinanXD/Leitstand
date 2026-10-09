"use client";

import { useState } from "react";
import { nurProjekt } from "@/lib/projekte";
import { aktivitaet, brauchtDich, heuteSatz, inArbeit, kontingente, letzte24h, schiene, type Quelle, type SnapshotRow } from "@/lib/uebersicht";
import { ProjektFilter, Rahmen, projekteIn, uhrzeit } from "./rahmen";

const KEINE_DATEN = <p className="leer">Keine Daten</p>;
const SEGMENTE = 10;

function Zeilen({ zeilen }: { zeilen: SnapshotRow[] }) {
  if (zeilen.length === 0) return KEINE_DATEN;
  return (
    <ul className="liste">
      {zeilen.map((z) => (
        <li key={`${z.project}-${z.title ?? z.stage ?? ""}`}>
          <span className="mono">{z.project}</span> {z.title ?? z.stage ?? ""}
        </li>
      ))}
    </ul>
  );
}

export function Bento({ quelle, jetzt }: { quelle: Quelle; jetzt: Date }) {
  const satz = heuteSatz(quelle, jetzt);
  const stufen = schiene(quelle.snapshot);
  const laeuft = inArbeit(quelle.snapshot);
  const wartet = brauchtDich(quelle.snapshot);
  const quoten = kontingente(quelle.snapshot);
  const events24 = letzte24h(quelle.events, jetzt);
  const balken = aktivitaet(quelle.events, jetzt);
  const spitze = Math.max(...balken, 1);
  const projekte = new Set(quelle.snapshot.map((s) => s.project)).size;

  return (
    <main className="bento">
      <section className="tile breit" aria-labelledby="heute">
        <h1 id="heute" className="mono-label">
          Heute in einem Satz
        </h1>
        {satz ? (
          <>
            <p className="satz">{satz.satz}</p>
            <ul className="liste" aria-label="Belege">
              {satz.belege.map((b) => (
                <li key={b.id}>
                  <span className="mono">{uhrzeit(b.created_at)}</span> {[b.project, b.step, b.status, b.issue].filter(Boolean).join(" ")}
                </li>
              ))}
            </ul>
          </>
        ) : (
          KEINE_DATEN
        )}
      </section>

      <section className="tile breit" aria-labelledby="pipeline">
        <h2 id="pipeline" className="mono-label">
          Pipeline
        </h2>
        {stufen.length === 0 ? (
          KEINE_DATEN
        ) : (
          <ol className="schiene">
            {stufen.map((s) => (
              <li key={s.stage} className={s.anzahl > 0 ? "belegt" : undefined}>
                <span className="mono-label">{s.stage}</span>
                <span className="zahl mono">{s.anzahl}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="tile" aria-labelledby="arbeit">
        <h2 id="arbeit" className="mono-label">
          In Arbeit
        </h2>
        <Zeilen zeilen={laeuft} />
      </section>

      <section className="tile" aria-labelledby="zahlen">
        <h2 id="zahlen" className="mono-label">
          Zahlen
        </h2>
        {quelle.events.length === 0 && quelle.snapshot.length === 0 ? (
          KEINE_DATEN
        ) : (
          <dl className="zahlen">
            <div>
              <dt>Projekte</dt>
              <dd className="mono">{projekte}</dd>
            </div>
            <div>
              <dt>In Arbeit</dt>
              <dd className="mono">{laeuft.length}</dd>
            </div>
            <div>
              <dt>Ereignisse 24 h</dt>
              <dd className="mono">{events24.length}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className="tile" aria-labelledby="braucht">
        <h2 id="braucht" className="mono-label">
          Braucht dich
        </h2>
        <Zeilen zeilen={wartet} />
      </section>

      <section className="tile" aria-labelledby="kontingente">
        <h2 id="kontingente" className="mono-label">
          Kontingente
        </h2>
        {quoten.length === 0 ? (
          KEINE_DATEN
        ) : (
          <ul className="liste">
            {quoten.map((q) => {
              const gefuellt = Math.min(SEGMENTE, Math.round((q.used / q.limit) * SEGMENTE));
              return (
                <li key={q.name}>
                  <span>
                    {q.name}
                    {q.schaetzung && " (Schätzung)"}
                  </span>{" "}
                  <span className="mono">
                    {q.used} / {q.limit}
                  </span>
                  <div className="segmente" aria-hidden="true">
                    {Array.from({ length: SEGMENTE }, (_, i) => (
                      <div key={i} className={i < gefuellt ? "voll" : undefined} />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="tile breit" aria-labelledby="aktivitaet">
        <h2 id="aktivitaet" className="mono-label">
          Aktivität 24 h
        </h2>
        {events24.length === 0 ? (
          KEINE_DATEN
        ) : (
          <div className="balken" role="img" aria-label={`${events24.length} Ereignisse in 24 Stunden, stündlich: ${balken.join(", ")}`}>
            {balken.map((n, i) => (
              <div key={i} style={{ height: `${(n / spitze) * 100}%` }} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default function Home() {
  const [filter, setFilter] = useState<string | null>(null);
  return (
    <Rahmen aktiv="uebersicht">
      {(quelle, jetzt) => {
        const gefiltert: Quelle = { events: nurProjekt(quelle.events, filter), snapshot: nurProjekt(quelle.snapshot, filter) };
        return (
          <>
            <div className="werkzeuge">
              <ProjektFilter projekte={projekteIn(quelle)} wert={filter} onChange={setFilter} />
            </div>
            <Bento quelle={gefiltert} jetzt={jetzt} />
          </>
        );
      }}
    </Rahmen>
  );
}
