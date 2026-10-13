"use client";

import Link from "next/link";
import { useSitzung } from "@/lib/sitzung";
import { useKosten } from "@/lib/kosten-client";
import { projektInfo } from "@/lib/projekte";
import { kontingente, type Quelle } from "@/lib/uebersicht";
import { fortschritt, heuteFertig, karten, lageSatz, stationen } from "@/lib/uebersicht-einfach";
import type { Kosten } from "@/lib/kosten/kosten";
import { pauseSatz } from "@/lib/pause";
import { GedaechtnisKachel } from "./gedaechtnis-kachel";
import { Rahmen, type Wartende } from "./rahmen";
import "./einfach.css";

const euro = (v: number) => `${v.toFixed(2).replace(".", ",")} €`;
const prozent = (anteil: number) => `${Math.min(100, Math.round(anteil * 100))}%`;

/** Balken mit Text für Screenreader; die Breite kommt aus dem Anteil. */
function Balken({ anteil, name, rot = false }: { anteil: number; name: string; rot?: boolean }) {
  return (
    <div className={rot ? "balken rot" : "balken"} role="img" aria-label={`${name}: ${Math.round(anteil * 100)} Prozent`}>
      <div style={{ width: prozent(anteil) }} />
    </div>
  );
}

function Lage({ quelle, jetzt, wartend, laden, pausiert }: { quelle: Quelle; jetzt: Date; wartend: number; laden: string; pausiert: string | null }) {
  const lage = lageSatz(quelle, wartend, jetzt);
  const fertig = heuteFertig(quelle, jetzt).length;
  const gebaut = stationen(quelle, [], jetzt).find((s) => s.id === "gebaut")?.eintraege.length ?? 0;
  return (
    <section className="einfach-lage" aria-labelledby="lage">
      {pausiert && (
        <p className="achtung" role="status">
          {pausiert}
        </p>
      )}
      <h1 id="lage" className={lage?.alarm ? "satz alarm" : "satz"}>
        {lage ? lage.satz : laden === "fehler" ? "Die Daten konnten nicht geladen werden." : laden === "laedt" ? "Daten werden geladen …" : "Keine Daten"}
      </h1>
      {lage && (
        <p className="unterzeile mono">
          Heute {fertig} {fertig === 1 ? "Änderung" : "Änderungen"} fertig · {gebaut} {gebaut === 1 ? "wird" : "werden"} gerade gebaut
        </p>
      )}
    </section>
  );
}

function MussDuTun({ quelle, wartend }: { quelle: Quelle; wartend: Wartende }) {
  const liste = karten(quelle, wartend.wartende);
  if (liste.length === 0) return null;
  return (
    <section className="tile einfach-block" aria-labelledby="tun">
      <div className="kopf-block">
        <h2 id="tun" className="mono-label">
          Das musst du tun · {liste.length}
        </h2>
        <p className="leer">Ein Tipp genügt. Alles andere erledigt der Loop.</p>
      </div>
      <ul className="karten">
        {liste.map((k) => (
          <li key={k.key} className="karte">
            <div className="karte-text">
              <span className="karte-titel">{k.titel}</span>
              <span className="leer">{k.warum}</span>
              <span className="mono-label">{[k.projekt, k.pr && `PR ${k.pr}`, k.minuten !== null && `${k.minuten} MIN`].filter(Boolean).join(" · ")}</span>
              {wartend.fehler[k.key] && (
                <span className="fehler" role="alert">
                  {wartend.fehler[k.key]}
                </span>
              )}
            </div>
            <div className="karte-knoepfe">
              {k.wartender && (
                <button type="button" className="knopf aktiv" aria-label={`${k.titel} freigeben`} onClick={() => void wartend.freigeben(k.wartender!)}>
                  Freigeben
                </button>
              )}
              {k.ansehen && (
                <a className="knopf" href={k.ansehen} target="_blank" rel="noreferrer" aria-label={`${k.titel} ansehen`}>
                  Ansehen →
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Kette({ quelle, wartend, jetzt }: { quelle: Quelle; wartend: Wartende; jetzt: Date }) {
  const liste = stationen(quelle, wartend.wartende, jetzt);
  return (
    <section className="tile einfach-block" aria-labelledby="kette">
      <div className="kopf-block">
        <h2 id="kette" className="mono-label">
          Was gerade passiert
        </h2>
        <p className="leer">Jede Aufgabe läuft von links nach rechts durch. Der grüne Punkt zeigt, wo gerade ein Agent arbeitet.</p>
      </div>
      <ol className="kette">
        {liste.map((s, i) => (
          <li key={s.id} className="station" aria-label={s.name}>
            <div className="station-kopf">
              <span className="kreis mono" aria-hidden="true">
                {i + 1}
              </span>
              <span className="station-name">{s.name}</span>
              <span className="leer">{s.hinweis}</span>
            </div>
            {s.eintraege.length === 0 ? (
              <p className="leer">Gerade nichts</p>
            ) : (
              <ul className="eintraege">
                {s.eintraege.map((e) => (
                  <li key={e.key} className="eintrag">
                    <span className={e.rot ? "punkt rot" : e.aktiv ? "punkt aktiv" : "punkt"} aria-hidden="true" />
                    <span className="eintrag-titel">
                      {e.titel}
                      {e.aktiv && <span className="sr-only"> (ein Agent arbeitet gerade)</span>}
                      {e.rot && <span className="sr-only"> (Fehler)</span>}
                    </span>
                    <span className="mono-label">
                      {projektInfo(e.projekt).name}
                      {e.minuten !== null ? ` · ${e.minuten} MIN` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function WieWeit({ quelle }: { quelle: Quelle }) {
  const liste = fortschritt(quelle);
  return (
    <section className="tile einfach-block" aria-labelledby="weit">
      <div className="kopf-block">
        <h2 id="weit" className="mono-label">
          Wie weit ist es?
        </h2>
        <p className="leer">Fertig heißt: alles aus der Produktbeschreibung steht. Neue Ideen kommen danach nach und nach.</p>
      </div>
      {liste.length === 0 ? (
        <p className="leer">Keine Daten</p>
      ) : (
        <ul className="fortschritt">
          {liste.map((f) => {
            const name = projektInfo(f.project).name;
            return (
              <li key={f.project}>
                <div className="zeile">
                  <span>{name}</span>
                  <span className="mono">
                    {f.fertig} von {f.gesamt} fertig
                  </span>
                </div>
                <Balken anteil={f.fertig / f.gesamt} name={name} />
                {f.neueIdeen > 0 && (
                  <p className="leer">
                    +{f.neueIdeen} {f.neueIdeen === 1 ? "neue Idee" : "neue Ideen"} · kommen nach und nach
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const monat = (jetzt: Date) => jetzt.toLocaleDateString("de-DE", { month: "long", timeZone: "Europe/Berlin" });

function WasKostet({ quelle, jetzt, angemeldet }: { quelle: Quelle; jetzt: Date; angemeldet: boolean }) {
  const stand = useKosten(angemeldet);
  const kosten: Kosten | null = stand.zustand === "ok" ? stand.kosten : null;
  const abo = kontingente(quelle.snapshot).filter((q) => q.schaetzung);
  return (
    <section className="tile einfach-block" aria-labelledby="kostet">
      <div className="kopf-block">
        <h2 id="kostet" className="mono-label">
          Was kostet das?
        </h2>
        <p className="leer">Was die Agenten ausgegeben haben. Feste Abos sind nicht enthalten.</p>
      </div>
      {!kosten || kosten.heute === null || kosten.monat === null ? (
        <p className="leer">{stand.zustand === "laedt" ? "Wird geladen …" : "Keine Daten"}</p>
      ) : (
        <>
          <p className="summe">
            <span className="mono">{euro(kosten.heute)}</span>
            <span className="leer">
              heute · {euro(kosten.monat)} von {euro(kosten.budget).replace(",00", "")} im {monat(jetzt)}
            </span>
          </p>
          <Balken anteil={kosten.monat / kosten.budget} name="Monatsbudget verbraucht" rot={kosten.ampel === "rot"} />
          <ul className="posten">
            {kosten.zeilen.map((z) => (
              <li key={z.art} className="zeile">
                <span>{z.art}</span>
                <span className="mono">{z.verfuegbar && z.heute !== null ? euro(z.heute) : "nicht verfügbar"}</span>
              </li>
            ))}
            {abo.map((q) => (
              <li key={q.name} className="zeile">
                <span>{q.name}: schon benutzt (Schätzung)</span>
                <span className="mono">≈ {Math.round((q.used / q.limit) * 100)} %</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function HeuteFertig({ quelle, jetzt }: { quelle: Quelle; jetzt: Date }) {
  const liste = heuteFertig(quelle, jetzt);
  return (
    <section className="tile einfach-block" aria-labelledby="fertig">
      <div className="kopf-block">
        <h2 id="fertig" className="mono-label">
          Heute fertig geworden
        </h2>
        <p className="leer">In einfachen Worten, was jetzt anders ist.</p>
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

export default function Home() {
  const sitzung = useSitzung();
  const angemeldet = sitzung.zustand === "ok" && sitzung.sitzung !== null;
  return (
    <Rahmen aktiv="uebersicht">
      {(quelle, jetzt, wartend, pause, laden) => (
        <main className="einfach">
          <Lage quelle={quelle} jetzt={jetzt} wartend={karten(quelle, wartend.wartende).length} laden={laden} pausiert={pause.stand?.pausiert ? pauseSatz(pause.stand.seit) : null} />
          <MussDuTun quelle={quelle} wartend={wartend} />
          <Kette quelle={quelle} wartend={wartend} jetzt={jetzt} />
          <div className="zwei-spalten">
            <WieWeit quelle={quelle} />
            <WasKostet quelle={quelle} jetzt={jetzt} angemeldet={angemeldet} />
          </div>
          <HeuteFertig quelle={quelle} jetzt={jetzt} />
          <GedaechtnisKachel angemeldet={angemeldet} />
          <p>
            <Link href="/details" className="knopf">
              Details ansehen
            </Link>
          </p>
        </main>
      )}
    </Rahmen>
  );
}
