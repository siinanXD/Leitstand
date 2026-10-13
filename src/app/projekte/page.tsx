"use client";

import Link from "next/link";
import { PROJEKTE, alleProjekte } from "@/lib/projekte";
import { alleZeilen, projekteSatz } from "@/lib/projektseite";
import { projekteIn, Rahmen } from "../rahmen";
import { GedaechtnisKachel } from "../gedaechtnis-kachel";
import { HeuteFertig } from "../fertig-karte";
import { WerbungKachel } from "../werbung-kachel";
import "../freigabe.css";
import "../uebersicht.css";
import "./projekte.css";
import "../bunt.css";

const NICHT_VERFUEGBAR = <span className="leer">nicht verfügbar</span>;

/** Alle Projekte nach Figma D1/D3 (SIN-531): Satz, Claude-Verbrauch, Tabelle. Alles aus loop_events und loop_snapshot. */
export default function Projekte() {
  return (
    <Rahmen aktiv="projekte">
      {(quelle, jetzt) => {
        const projekte = alleProjekte([...PROJEKTE.map((p) => p.id), ...projekteIn(quelle).map((p) => p.id)]);
        const zeilen = alleZeilen(quelle, projekte, jetzt);
        const satz = projekteSatz(zeilen);
        const worker = zeilen.reduce((n, z) => n + z.worker, 0);
        return (
          <main className="bento-b1 projekte-seite">
            <section className="tile b1-satz" aria-labelledby="alle" style={{ gridColumn: "1 / -1" }}>
              <h1 id="alle" className="mono-label">
                Alle Projekte
              </h1>
              <p className="satz-text">{satz ?? "Keine Daten"}</p>
            </section>

            <section className="tile b1-kachel" aria-labelledby="plaetze">
              <h2 id="plaetze" className="mono-label">
                Worker-Plätze
              </h2>
              <p className="mono">{worker} belegt</p>
              <p className="grund">Wie viele Plätze es gibt, steht nicht in den Daten.</p>
            </section>

            <section className="tile b1-kachel" aria-labelledby="verbrauch">
              <h2 id="verbrauch" className="mono-label">
                Claude-Verbrauch je Projekt · Schätzung
              </h2>
              <ul className="aufgaben">
                {zeilen.map((z) => (
                  <li key={z.projekt.id}>
                    <span>{z.projekt.name}</span>
                    <span className="mono">{z.kontingente.length ? z.kontingente.map((k) => `${k.name} ${k.used}/${k.limit}`).join(", ") : "nicht verfügbar"}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="tile b1-kachel tabelle-kachel" aria-labelledby="tabelle">
              <h2 id="tabelle" className="mono-label">
                Projekte
              </h2>
              <div className="tabelle-rahmen" role="region" aria-labelledby="tabelle" tabIndex={0}>
                <table className="projekt-tabelle">
                  <thead>
                    <tr>
                      <th scope="col">Projekt</th>
                      <th scope="col">Phase</th>
                      <th scope="col">Reife</th>
                      <th scope="col">Worker</th>
                      <th scope="col">PRs</th>
                      <th scope="col">Braucht dich</th>
                      <th scope="col">Kette</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zeilen.map((z) => (
                      <tr key={z.projekt.id}>
                        <th scope="row">
                          <Link href={`/projekt/${z.projekt.id}`} className="projekt-name">
                            <span className="marke-projekt" style={{ background: z.projekt.farbe }} aria-hidden="true" /> {z.projekt.name}
                          </Link>
                        </th>
                        <td>{z.phase ?? NICHT_VERFUEGBAR}</td>
                        <td>{NICHT_VERFUEGBAR}</td>
                        <td className="mono">{z.phase ? z.worker : NICHT_VERFUEGBAR}</td>
                        <td className="mono">{z.phase ? z.prs : NICHT_VERFUEGBAR}</td>
                        <td className="mono">{z.phase ? z.brauchtDich : NICHT_VERFUEGBAR}</td>
                        <td>
                          {z.kette.length ? (
                            <ol className="stufen">
                              {z.kette.map((s) => (
                                <li key={s.stage} className={s.zustand === "leer" ? undefined : s.zustand}>
                                  {s.stage}
                                  {s.zustand === "rot" && <span className="sr-only"> rot</span>}
                                </li>
                              ))}
                            </ol>
                          ) : (
                            NICHT_VERFUEGBAR
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="einfach bunt" style={{ gridColumn: "1 / -1", padding: 0 }}>
              <HeuteFertig quelle={quelle} jetzt={jetzt} />
              <WerbungKachel angemeldet />
              <GedaechtnisKachel angemeldet />
            </div>
          </main>
        );
      }}
    </Rahmen>
  );
}
