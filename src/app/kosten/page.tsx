"use client";

import { useSitzung } from "@/lib/sitzung";
import { useKosten } from "@/lib/kosten-client";
import { einzigartig, GUTHABEN_UNTER, KONTINGENT_UEBER, restAnteil, type Guthaben } from "@/lib/kosten/guthaben";
import { kontingente } from "@/lib/uebersicht";
import { Rahmen } from "../rahmen";
import { ZustandSymbol, type ZustandArt } from "../zustand-symbol";
import "../bunt.css";

const euro = (v: number) => `${v.toFixed(2).replace(".", ",")} €`.replace(",00", "");
const QUELLE = { api: "", gerechnet: " (gerechnet)", schaetzung: " (Schätzung)" } as const;

function Balken({ anteil, name, rot }: { anteil: number; name: string; rot: boolean }) {
  return (
    <div className={rot ? "balken rot" : "balken"} role="img" aria-label={`${name}: ${Math.round(anteil * 100)} Prozent`}>
      <div style={{ width: `${Math.min(100, Math.round(anteil * 100))}%` }} />
    </div>
  );
}

/** Glas, das sich füllt (SIN-578): Höhe = Anteil des Deckels. */
function Glas({ anteil, name, rot }: { anteil: number; name: string; rot: boolean }) {
  return (
    <div className={rot ? "glas rot" : "glas"} role="img" aria-label={`${name}: ${Math.round(anteil * 100)} Prozent`}>
      <div style={{ height: `${Math.min(100, Math.round(anteil * 100))}%` }} />
    </div>
  );
}

const rest = (g: Guthaben) => (g.einheit === "€" ? `${euro(g.wert)} übrig` : `${g.wert.toLocaleString("de-DE")} ${g.einheit} übrig`);

/** Kosten nach Figma K6 v2 (SIN-578, 85:48): Glas für die Woche, je Dienst eine schmale Zeile mit Balken und Rest in Worten (Ausnahme zu „höchstens drei“, Sinan 13.10.). Nur echte Daten. */
export default function Kosten() {
  const sitzung = useSitzung();
  const angemeldet = sitzung.zustand === "ok" && sitzung.sitzung !== null;
  const stand = useKosten(angemeldet);
  const kosten = stand.zustand === "ok" ? stand.kosten : null;
  return (
    <Rahmen aktiv="kosten">
      {(quelle) => {
        const abo = kontingente(quelle.snapshot).filter((q) => q.schaetzung);
        const guthaben = einzigartig(quelle.snapshot.flatMap((s) => s.guthaben ?? []));
        const frei = kontingente(quelle.snapshot).filter((q) => !q.schaetzung);
        const wochenAnteil = kosten && kosten.woche !== null ? kosten.woche / kosten.wochenDeckel : null;
        const zustand: ZustandArt = kosten?.ampel === "rot" || (wochenAnteil ?? 0) >= 0.9 ? "kaputt" : kosten?.ampel === "gelb" ? "wartet" : "laeuft";
        return (
          <main className="einfach bunt">
            <div className="kopf-titel">
              <h1>Was kostet das?</h1>
            </div>
            <section className="tile einfach-block pfirsich" aria-labelledby="woche">
              <h2 id="woche" className="karte-titel">
                Diese Woche
              </h2>
              {kosten && kosten.woche !== null && wochenAnteil !== null ? (
                <div className="dienst">
                  <Glas anteil={wochenAnteil} name="Wochendeckel verbraucht" rot={zustand === "kaputt"} />
                  <div className="dienst-schmal">
                    <ZustandSymbol art={zustand} />
                    <p className="summe">
                      <span className="mono">{euro(kosten.woche)} diese Woche</span>
                      <span className="leer">von höchstens {euro(kosten.wochenDeckel)}, ohne feste Abos</span>
                    </p>
                    {kosten.heute !== null && <p className="leer">Heute {euro(kosten.heute)}</p>}
                  </div>
                </div>
              ) : (
                <p className="leer">{stand.zustand === "laedt" ? "Wird geladen …" : "Keine Daten"}</p>
              )}
            </section>

            <section className="tile einfach-block" aria-labelledby="dienste">
              <h2 id="dienste" className="karte-titel">
                Was noch übrig ist
              </h2>
              {guthaben.length + frei.length + abo.length === 0 ? (
                <p className="leer">Keine Daten</p>
              ) : (
                <ul className="fortschritt">
                  {guthaben.map((g) => (
                    <li key={g.dienst} className="dienst-schmal">
                      <span className="zeile">
                        <span>{g.dienst}</span>
                        <span>
                          {rest(g)}
                          {QUELLE[g.quelle]}
                        </span>
                      </span>
                      <Balken anteil={restAnteil(g)} name={`${g.dienst}: Guthaben übrig`} rot={restAnteil(g) < GUTHABEN_UNTER} />
                      {g.link && restAnteil(g) < GUTHABEN_UNTER && (
                        <a className="knopf aktiv" href={g.link} target="_blank" rel="noreferrer">
                          Aufladen →
                        </a>
                      )}
                    </li>
                  ))}
                  {frei.map((q) => (
                    <li key={q.name} className="dienst-schmal">
                      <span className="zeile">
                        <span>{q.name}</span>
                        <span>
                          {q.used.toLocaleString("de-DE")} von {q.limit.toLocaleString("de-DE")} benutzt
                        </span>
                      </span>
                      <Balken anteil={q.used / q.limit} name={`${q.name}: benutzt`} rot={q.used / q.limit > KONTINGENT_UEBER} />
                    </li>
                  ))}
                  {abo.map((q) => (
                    <li key={q.name} className="dienst-schmal">
                      <span className="zeile">
                        <span>{q.name}</span>
                        <span>etwa {Math.round((q.used / q.limit) * 100)} % benutzt (Schätzung)</span>
                      </span>
                      <Balken anteil={q.used / q.limit} name={`${q.name}: benutzt (Schätzung)`} rot={q.used / q.limit > KONTINGENT_UEBER} />
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
