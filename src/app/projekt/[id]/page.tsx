"use client";

import Link from "next/link";
import { use, useState } from "react";
import { projektInfo } from "@/lib/projekte";
import { alsNaechstes, projektAufgaben, projektBetrieb, projektLinks, projektQuelle, zeitVerteilung } from "@/lib/projektseite";
import { Rahmen } from "../../rahmen";
import "../../uebersicht.css";
import "../../projekte/projekte.css";

const NICHT_VERFUEGBAR = <p className="leer">nicht verfügbar</p>;

/** Projektseite nach Figma C1 (Übersicht) und C4 (Deine Aufgaben), SIN-531. Alle Zahlen echt, sonst „nicht verfügbar“. */
export default function ProjektSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projekt = projektInfo(decodeURIComponent(id));
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);

  return (
    <Rahmen aktiv="projekte">
      {(quelle, jetzt) => {
        const mein = projektQuelle(quelle, projekt.id);
        const naechstes = alsNaechstes(quelle.snapshot, projekt.id);
        const zeit = zeitVerteilung(mein.events, jetzt);
        const betrieb = projektBetrieb(quelle, projekt.id, jetzt);
        const aufgaben = projektAufgaben(quelle.snapshot, projekt.id);
        const aktiv = aufgaben.find((a) => a.key === gewaehlt) ?? aufgaben[0];
        return (
          <main className="bento-b1 projekte-seite">
            <section className="tile b1-satz" aria-labelledby="projekt" style={{ gridColumn: "1 / -1" }}>
              <h1 id="projekt" className="mono-label">
                <Link href="/projekte">Alle Projekte</Link> · <span className="marke-projekt" style={{ background: projekt.farbe }} aria-hidden="true" /> {projekt.name}
              </h1>
              <ul className="link-leiste" aria-label="Links">
                {projektLinks(projekt).map((l) => (
                  <li key={l.art}>
                    {l.href ? (
                      <a href={l.href} target="_blank" rel="noreferrer">
                        {l.name}
                      </a>
                    ) : (
                      <span className="leer">
                        {l.name}
                        <span className="sr-only">: nicht verfügbar</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <div className="b1-spalte">
              <section className="tile b1-kachel" aria-labelledby="naechstes">
                <h2 id="naechstes" className="mono-label">
                  Als Nächstes
                </h2>
                {naechstes.length === 0 ? (
                  NICHT_VERFUEGBAR
                ) : (
                  <ul className="aufgaben">
                    {naechstes.map((t) => (
                      <li key={t}>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="tile b1-kachel" aria-labelledby="prognose">
                <h2 id="prognose" className="mono-label">
                  Prognose fertig
                </h2>
                {NICHT_VERFUEGBAR}
              </section>

              <section className="tile b1-kachel" aria-labelledby="content">
                <h2 id="content" className="mono-label">
                  Content-Stand
                </h2>
                <p className="grund">Bewertet, veröffentlicht, Stichprobe</p>
                {NICHT_VERFUEGBAR}
              </section>
            </div>

            <div className="b1-spalte">
              <section className="tile b1-kachel" aria-labelledby="zeit">
                <h2 id="zeit" className="mono-label">
                  Wo die Zeit hingeht · 24 h
                </h2>
                {zeit.length === 0 ? (
                  NICHT_VERFUEGBAR
                ) : (
                  <ul className="aufgaben">
                    {zeit.map((z) => (
                      <li key={z.stufe}>
                        <span className="mono">{z.stufe}</span>
                        <span className="mono">{Math.round(z.anteil * 100)} %</span>
                        <span className="mono">{z.anzahl}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="tile b1-kachel" aria-labelledby="betrieb">
                <h2 id="betrieb" className="mono-label">
                  Betrieb
                </h2>
                {betrieb.stufen.length === 0 ? (
                  NICHT_VERFUEGBAR
                ) : (
                  <>
                    <ol className="stufen">
                      {betrieb.stufen.map((s) => (
                        <li key={s.stage} className={s.zustand === "leer" ? undefined : s.zustand}>
                          {s.stage}
                          {s.zustand === "rot" && <span className="sr-only"> rot</span>}
                        </li>
                      ))}
                    </ol>
                    {betrieb.grund && <p className="grund">{betrieb.grund}</p>}
                    <p className="mono">
                      {betrieb.ereignisse24h} Ereignisse · Modellkosten {betrieb.kostenUsd !== null ? `${betrieb.kostenUsd.toFixed(2).replace(".", ",")} $` : "nicht verfügbar"}
                    </p>
                  </>
                )}
              </section>
            </div>

            <section className="tile b1-kachel" aria-labelledby="deine" style={{ gridColumn: "1 / -1" }}>
              <h2 id="deine" className="mono-label">
                Deine Aufgaben · {aufgaben.length}
              </h2>
              {aufgaben.length === 0 ? (
                <p className="leer">Keine Aufgaben für dich.</p>
              ) : (
                <div className="aufgaben-spalten">
                  <ul className="aufgaben">
                    {aufgaben.map((a) => (
                      <li key={a.key}>
                        <button type="button" className="knopf aufgabe-knopf" aria-pressed={a.key === aktiv?.key} onClick={() => setGewaehlt(a.key)}>
                          <span>{a.titel}</span>
                          <span className="mono">{a.ref}</span>
                          {a.minuten !== null && <span className="mono">{a.minuten} MIN</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {aktiv && (
                    <div className="anleitung" aria-live="polite">
                      <h3 className="mono-label">{aktiv.titel}</h3>
                      <p className="grund">Für diese Aufgabe ist keine Schritt-für-Schritt-Anleitung hinterlegt. Die Schritte stehen im Linear-Issue.</p>
                      <p className="grund">Erledigt ist sie erst, wenn der Loop das Label `sinan` nicht mehr findet.</p>
                      {aktiv.href && (
                        <a className="knopf aktiv" href={aktiv.href} target="_blank" rel="noreferrer">
                          In Linear öffnen
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          </main>
        );
      }}
    </Rahmen>
  );
}
