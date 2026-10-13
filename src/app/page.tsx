"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useSitzung } from "@/lib/sitzung";
import { projektInfo } from "@/lib/projekte";
import type { Quelle } from "@/lib/uebersicht";
import { fortschritt, karten, lageSatz, stationen, type Fortschritt, type Karte, type Station } from "@/lib/uebersicht-einfach";
import { pauseSatz } from "@/lib/pause";
import { ChefZeile } from "./chef-karte";
import { Rahmen, type Wartende } from "./rahmen";
import "./bunt.css";

/** Kennung SIN-… aus dem Schlüssel „projekt|SIN-…“; nur dann gibt es eine Ablauf-Seite. */
const kennungVon = (key: string) => key.split("|")[1]?.match(/^SIN-\d+$/)?.[0] ?? null;

const prozent = (anteil: number) => `${Math.min(100, Math.round(anteil * 100))}%`;

/** Balken mit Text für Screenreader; die Breite kommt aus dem Anteil. */
function Balken({ anteil, name }: { anteil: number; name: string }) {
  return (
    <div className="balken" role="img" aria-label={`${name}: ${Math.round(anteil * 100)} Prozent`}>
      <div style={{ width: prozent(anteil) }} />
    </div>
  );
}

/** Eine Karte: eingeklappt zwei Zeilen. Gleicher `name` heißt, dass der Browser nur eine Karte offen lässt (SIN-568). */
function Aufklappkarte({ farbe, titel, zeile, children }: { farbe: string; titel: string; zeile: string; children: ReactNode }) {
  return (
    <details name="start" className={`tile aufklapp ${farbe}`}>
      <summary>
        <h2 className="aufklapp-titel">{titel}</h2>
        <span className="aufklapp-zeile">{zeile}</span>
      </summary>
      <div className="aufklapp-inhalt">{children}</div>
    </details>
  );
}

function MussDuTun({ liste, wartend }: { liste: Karte[]; wartend: Wartende }) {
  if (liste.length === 0) return <p className="leer">Gerade nichts. Der Loop arbeitet allein.</p>;
  return (
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
            {k.aufladen && (
              <a className="knopf aktiv" href={k.aufladen} target="_blank" rel="noreferrer" aria-label={`${k.titel}: Aufladen`}>
                Aufladen →
              </a>
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
  );
}

function Kette({ liste }: { liste: Station[] }) {
  return (
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
                    {kennungVon(e.key) ? <Link href={`/aufgabe/${kennungVon(e.key)}`}>{e.titel}</Link> : e.titel}
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
  );
}

function WieWeit({ liste }: { liste: Fortschritt[] }) {
  if (liste.length === 0) return <p className="leer">Keine Daten</p>;
  return (
    <>
      <p className="leer">Fertig heißt: alles aus der Produktbeschreibung steht. Neue Ideen kommen danach nach und nach.</p>
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
    </>
  );
}

/** Kurzfassung für die zweite Zeile der Karte „Wann fertig?“: das erste Produkt mit Prozent, dazu die Zahl der übrigen. */
function fertigZeile(liste: Fortschritt[]) {
  const f = liste.find((x) => x.gesamt > 0);
  if (!f) return "Keine Daten";
  const mehr = liste.length - 1;
  return `${projektInfo(f.project).name} ${Math.round((f.fertig / f.gesamt) * 100)} %${mehr > 0 ? ` · +${mehr} weitere` : ""}`;
}

function Start({ quelle, jetzt, wartend, laden, pausiert, angemeldet }: { quelle: Quelle; jetzt: Date; wartend: Wartende; laden: string; pausiert: string | null; angemeldet: boolean }) {
  const aufgaben = karten(quelle, wartend.wartende);
  const lage = lageSatz(quelle, aufgaben.length, jetzt);
  const kette = stationen(quelle, wartend.wartende, jetzt);
  const laufen = kette.flatMap((s) => s.eintraege).filter((e) => e.aktiv).length;
  const weit = fortschritt(quelle);
  return (
    <main className="einfach bunt">
      <section className="einfach-lage" aria-labelledby="lage">
        {pausiert && (
          <p className="achtung" role="status">
            {pausiert}
          </p>
        )}
        <h1 id="lage" className={lage?.alarm ? "satz alarm" : "satz"}>
          {lage ? lage.satz : laden === "fehler" ? "Die Daten konnten nicht geladen werden." : laden === "laedt" ? "Daten werden geladen …" : "Keine Daten"}
        </h1>
        <ChefZeile angemeldet={angemeldet} />
      </section>
      <Aufklappkarte farbe="sonne" titel={`Was brauche ich von dir? · ${aufgaben.length}`} zeile={aufgaben[0]?.titel ?? "Nichts, alles läuft"}>
        <MussDuTun liste={aufgaben} wartend={wartend} />
      </Aufklappkarte>
      <Aufklappkarte farbe="gruen" titel={`Was passiert gerade? · ${laufen} ${laufen === 1 ? "läuft" : "laufen"}`} zeile="Von links nach rechts durch fünf Stationen">
        <Kette liste={kette} />
      </Aufklappkarte>
      <Aufklappkarte farbe="blau" titel={`Wann fertig? · ${fertigZeile(weit)}`} zeile="Antippen zeigt alle Produkte">
        <WieWeit liste={weit} />
      </Aufklappkarte>
      <p className="einfach-fuss">
        <Link href="/details" className="knopf">
          Details ansehen
        </Link>
      </p>
    </main>
  );
}

export default function Home() {
  const sitzung = useSitzung();
  const angemeldet = sitzung.zustand === "ok" && sitzung.sitzung !== null;
  return (
    <Rahmen aktiv="uebersicht">
      {(quelle, jetzt, wartend, pause, laden) => <Start quelle={quelle} jetzt={jetzt} wartend={wartend} laden={laden} pausiert={pause.stand?.pausiert ? pauseSatz(pause.stand.seit) : null} angemeldet={angemeldet} />}
    </Rahmen>
  );
}
