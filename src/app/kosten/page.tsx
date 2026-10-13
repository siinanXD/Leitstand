"use client";

import { useSitzung } from "@/lib/sitzung";
import { useKosten } from "@/lib/kosten-client";
import { einzigartig, GUTHABEN_UNTER, KONTINGENT_UEBER, restAnteil, type Guthaben } from "@/lib/kosten/guthaben";
import { kontingente } from "@/lib/uebersicht";
import { Rahmen } from "../rahmen";
import "../einfach.css";

const euro = (v: number) => `${v.toFixed(2).replace(".", ",")} €`;
const QUELLE = { api: "von der API", gerechnet: "gerechnet", schaetzung: "Schätzung" } as const;

function Balken({ anteil, name, rot }: { anteil: number; name: string; rot: boolean }) {
  return (
    <div className={rot ? "balken rot" : "balken"} role="img" aria-label={`${name}: ${Math.round(anteil * 100)} Prozent`}>
      <div style={{ width: `${Math.min(100, Math.round(anteil * 100))}%` }} />
    </div>
  );
}

const betrag = (g: Guthaben, v: number) => (g.einheit === "€" ? euro(v) : `${v.toLocaleString("de-DE")} ${g.einheit}`);

/** Kosten nach Figma K6 (SIN-555): Woche gegen Deckel, Guthaben je Dienst, freie Kontingente. Nur echte Daten, fehlende bleiben „nicht verfügbar“. */
export default function Kosten() {
  const sitzung = useSitzung();
  const angemeldet = sitzung.zustand === "ok" && sitzung.sitzung !== null;
  const stand = useKosten(angemeldet);
  const kosten = stand.zustand === "ok" ? stand.kosten : null;
  return (
    <Rahmen aktiv="kosten">
      {(quelle) => {
        const guthaben = einzigartig(quelle.snapshot.flatMap((s) => s.guthaben ?? []));
        const frei = kontingente(quelle.snapshot).filter((q) => !q.schaetzung);
        return (
          <main className="einfach">
            <section className="tile einfach-block" aria-labelledby="woche">
              <div className="kopf-block">
                <h1 id="woche" className="mono-label">
                  Diese Woche gegen den Deckel
                </h1>
                <p className="leer">Die letzten 7 Tage. Feste Abos sind nicht enthalten.</p>
              </div>
              {kosten && kosten.woche !== null ? (
                <>
                  <p className="summe">
                    <span className="mono">{euro(kosten.woche)}</span>
                    <span className="leer">von {euro(kosten.wochenDeckel).replace(",00", "")}</span>
                  </p>
                  <Balken anteil={kosten.woche / kosten.wochenDeckel} name="Wochendeckel verbraucht" rot={kosten.woche / kosten.wochenDeckel >= 0.9} />
                </>
              ) : (
                <p className="leer">{stand.zustand === "laedt" ? "Wird geladen …" : "Keine Daten"}</p>
              )}
            </section>

            <section className="tile einfach-block" aria-labelledby="guthaben">
              <div className="kopf-block">
                <h2 id="guthaben" className="mono-label">
                  Guthaben je Dienst
                </h2>
                <p className="leer">Rot unter {Math.round(GUTHABEN_UNTER * 100)} % übrig. Aufladen von Hand, der Leitstand zahlt nie selbst.</p>
              </div>
              {guthaben.length === 0 ? (
                <p className="leer">Keine Daten</p>
              ) : (
                <ul className="fortschritt">
                  {guthaben.map((g) => (
                    <li key={g.dienst}>
                      <div className="zeile">
                        <span>
                          {g.dienst} <span className="leer">· {QUELLE[g.quelle]}</span>
                        </span>
                        <span className="mono">
                          {betrag(g, g.wert)} von {betrag(g, g.gesamt)}
                        </span>
                      </div>
                      <Balken anteil={restAnteil(g)} name={`${g.dienst}: Guthaben übrig`} rot={restAnteil(g) < GUTHABEN_UNTER} />
                      {g.link && restAnteil(g) < GUTHABEN_UNTER && (
                        <a className="knopf aktiv" href={g.link} target="_blank" rel="noreferrer">
                          Aufladen →
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="tile einfach-block" aria-labelledby="frei">
              <div className="kopf-block">
                <h2 id="frei" className="mono-label">
                  Freie Kontingente
                </h2>
                <p className="leer">Rot über {Math.round(KONTINGENT_UEBER * 100)} % benutzt.</p>
              </div>
              {frei.length === 0 ? (
                <p className="leer">Keine Daten</p>
              ) : (
                <ul className="fortschritt">
                  {frei.map((q) => (
                    <li key={q.name}>
                      <div className="zeile">
                        <span>{q.name}</span>
                        <span className="mono">
                          {q.used.toLocaleString("de-DE")} von {q.limit.toLocaleString("de-DE")}
                        </span>
                      </div>
                      <Balken anteil={q.used / q.limit} name={`${q.name}: benutzt`} rot={q.used / q.limit > KONTINGENT_UEBER} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </main>
        );
      }}
    </Rahmen>
  );
}
