"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useSitzung } from "@/lib/sitzung";
import { laufende, type Aufgabe } from "@/lib/aufgaben";
import type { Zeile } from "@/lib/ceo/ceo";
import { projektInfo } from "@/lib/projekte";
import type { Quelle } from "@/lib/uebersicht";
import { fortschritt, karten, lageSatz, stationen, type Eintrag, type Karte, type Station, type StationId } from "@/lib/uebersicht-einfach";
import { pauseSatz } from "@/lib/pause";
import { veraltet } from "@/lib/veraltet";
import { ohneKennungen, zeitInWorten } from "@/lib/zeit";
import { ChefZeile } from "./chef-karte";
import { fertigZeile, WieWeit } from "./fortschritt-balken";
import { KennzahlenKachel } from "./kennzahlen-kachel";
import { MitMehr } from "./mit-mehr";
import { Rahmen, uhrzeit, type Wartende } from "./rahmen";
import { ZustandSymbol, type ZustandArt } from "./zustand-symbol";
import { useWartendeWerbung } from "./werbung-kachel";
import "./bunt.css";

/** Kennung SIN-… aus dem Schlüssel „projekt|SIN-…“; nur dann gibt es eine Aufgaben-Seite. */
const kennungVon = (key: string) => key.split("|")[1]?.match(/^SIN-\d+$/)?.[0] ?? null;

/** Eine Karte: eingeklappt zwei Zeilen, genau ein Zustand. Gleicher `name` heißt, dass der Browser nur eine Karte offen lässt (SIN-568). */
function Aufklappkarte({ farbe, zustand, titel, zeile, stand, children }: { farbe: string; zustand: ZustandArt; titel: string; zeile: string; stand: string; children: ReactNode }) {
  return (
    <details name="start" className={`tile aufklapp ${farbe}`}>
      <summary>
        <h2 className="aufklapp-titel">{titel}</h2>
        <span className="aufklapp-zeile">
          <ZustandSymbol art={zustand} nurSymbol /> {zeile}
        </span>
        <span className="mono-label">Stand: {uhrzeit(stand)}</span>
      </summary>
      <div className="aufklapp-inhalt">{children}</div>
    </details>
  );
}

function MussDuTun({ liste, wartend }: { liste: Karte[]; wartend: Wartende }) {
  if (liste.length === 0) return <p className="leer">Gerade nichts. Der Loop arbeitet allein.</p>;
  return (
    <MitMehr
      liste={liste}
      klasse="karten"
      zeile={(k) => (
        <li key={k.key} className="karte">
          <div className="karte-text">
            <span className="karte-titel">{ohneKennungen(k.titel)}</span>
            <span className="leer">{ohneKennungen(k.warum)}</span>
            <span className="mono-label">{k.projekt}</span>
            {wartend.fehler[k.key] && (
              <span className="fehler" role="alert">
                {wartend.fehler[k.key]}
              </span>
            )}
          </div>
          <div className="karte-knoepfe">
            {k.wartender && (
              <button type="button" className="knopf aktiv" aria-label={`${ohneKennungen(k.titel)} freigeben`} onClick={() => void wartend.freigeben(k.wartender!)}>
                Freigeben
              </button>
            )}
            {k.aufladen && (
              <a className="knopf aktiv" href={k.aufladen} target="_blank" rel="noreferrer" aria-label={`${ohneKennungen(k.titel)}: Aufladen`}>
                Aufladen →
              </a>
            )}
            {k.ansehen && (
              <a className="knopf" href={k.ansehen} target={k.ansehen.startsWith("/") ? undefined : "_blank"} rel="noreferrer" aria-label={`${ohneKennungen(k.titel)} ansehen`}>
                Ansehen →
              </a>
            )}
          </div>
        </li>
      )}
    />
  );
}

/** Ablauf als Kette: fünf Glieder, gefüllt, wo gerade etwas liegt; rot, wo etwas kaputt ist. Darunter höchstens drei Dinge. */
function Kette({ liste, jetzt }: { liste: Station[]; jetzt: Date }) {
  // Nur was kaputt ist, steht als Zeile darunter; alles andere zeigt die Kette (Sinan 13.10.: lange Listen mit „Eine Aufgabe“ sagen nichts).
  const dinge = liste.flatMap((s) => s.eintraege.filter((e) => e.rot).map((e) => ({ e, station: s.name, id: s.id })));
  return (
    <>
      <ol className="bild-kette" aria-label="Der Weg einer Aufgabe: geplant, gebaut, geprüft, wartet auf dich, live">
        {liste.map((s) => (
          <li key={s.id}>
            <span className={s.eintraege.some((e) => e.rot) ? "glied rot" : s.eintraege.length > 0 ? "glied voll" : "glied"} aria-hidden="true" />
            <span>{s.name}</span>
            <span className="sr-only">{s.eintraege.some((e) => e.rot) ? ": kaputt" : s.eintraege.length > 0 ? ": belegt" : ": leer"}</span>
          </li>
        ))}
      </ol>
      {dinge.length === 0 ? null : (
        <MitMehr liste={dinge} klasse="eintraege" zeile={({ e, station, id }) => <Ding key={e.key} e={e} station={station} id={id} jetzt={jetzt} />} />
      )}
    </>
  );
}

/** Was gerade gebaut wird, aus Linear („In Arbeit“): Titel, Produkt, seit wann. */
function InArbeit({ liste, jetzt }: { liste: Aufgabe[]; jetzt: Date }) {
  if (liste.length === 0) return <p className="leer">Gerade arbeitet niemand. Neue Aufgaben startet der Loop von selbst.</p>;
  return (
    <MitMehr
      liste={liste}
      klasse="eintraege"
      zeile={(a) => (
        <li key={a.issue} className="eintrag">
          <ZustandSymbol art="laeuft" nurSymbol />
          <span className="eintrag-titel">
            <Link href={`/aufgabe/${a.issue}`}>{ohneKennungen(a.titel)}</Link>
          </span>
          <span className="mono-label">{[a.projekt ? projektInfo(a.projekt).name : null, a.haken ? `${a.haken.erledigt} von ${a.haken.gesamt} Haken` : null, a.gestartet ? `gestartet ${zeitInWorten(a.gestartet, jetzt)}` : null].filter(Boolean).join(" · ")}</span>
        </li>
      )}
    />
  );
}

function Ding({ e, station, id, jetzt }: { e: Eintrag; station: string; id: StationId; jetzt: Date }) {
  const kennung = kennungVon(e.key);
  const titel = ohneKennungen(e.titel) || "Eine Aufgabe";
  const seit = e.seit ? zeitInWorten(e.seit, jetzt) : null;
  return (
    <li className="eintrag">
      <ZustandSymbol art={e.rot ? "kaputt" : id === "wartet" ? "wartet" : id === "live" ? "fertig" : "laeuft"} nurSymbol />
      <span className="eintrag-titel">{kennung ? <Link href={`/aufgabe/${kennung}`}>{titel}</Link> : titel}</span>
      <span className="mono-label">{[projektInfo(e.projekt).name, station, seit].filter(Boolean).join(" · ")}</span>
    </li>
  );
}

function Start({ quelle, jetzt, wartend, laden, pausiert, angemeldet, chef, stand, loopPausiert }: { quelle: Quelle; jetzt: Date; wartend: Wartende; laden: string; pausiert: string | null; angemeldet: boolean; chef: Zeile[] | null; stand: string; loopPausiert: boolean }) {
  const werbung = useWartendeWerbung(angemeldet);
  const werbeKarte: Karte[] = werbung
    ? [{ key: "werbung", titel: werbung === 1 ? "Ein Werbe-Entwurf wartet auf dein Ja" : `${werbung} Werbe-Entwürfe warten auf dein Ja`, warum: "Video oder Text ansehen, dann freigeben oder ablehnen.", projekt: "Werbung", pr: null, minuten: null, wartender: null, ansehen: "/freigabe/werbemittel", aufladen: null }]
    : [];
  const aufgaben = [...werbeKarte, ...karten(quelle, wartend.wartende)];
  const lage = lageSatz(quelle, aufgaben.length, jetzt);
  const kette = stationen(quelle, wartend.wartende, jetzt);
  const eintraege = kette.flatMap((s) => s.eintraege);
  const inArbeit = laufende(quelle.aufgaben);
  const laufen = inArbeit.length || eintraege.filter((e) => e.aktiv).length;
  const kaputt = eintraege.some((e) => e.rot);
  const weit = fortschritt(quelle);
  // Bei veralteten Daten kein Satz wie „Alles läuft“ (SIN-659); die Warnung steht oben im Rahmen.
  const alt = veraltet(quelle, jetzt, loopPausiert) !== null;
  return (
    <main className="einfach bunt">
      <KennzahlenKachel angemeldet={angemeldet} jetzt={jetzt} />
      <section className="einfach-lage" aria-labelledby="lage">
        {pausiert && (
          <p className="achtung" role="status">
            {pausiert}
          </p>
        )}
        <h1 id="lage" className={alt || lage?.alarm ? "satz alarm" : "satz"}>
          {alt ? "Achtung: Diese Zahlen sind nicht aktuell." : lage ? lage.satz : laden === "fehler" ? "Die Daten konnten nicht geladen werden." : "Keine Daten"}
        </h1>
        <ChefZeile angemeldet={angemeldet} zeilen={chef} snapshot={quelle.snapshot} />
      </section>
      <Aufklappkarte
        stand={stand}
        farbe="sonne"
        zustand={aufgaben.length > 0 ? "wartet" : "fertig"}
        titel={aufgaben.length > 0 ? `${aufgaben.length} ${aufgaben.length === 1 ? "wartet" : "warten"} auf dich` : "Nichts wartet auf dich"}
        zeile={aufgaben[0] ? ohneKennungen(aufgaben[0].titel) : "Alles läuft"}
      >
        <MussDuTun liste={aufgaben} wartend={wartend} />
      </Aufklappkarte>
      <Aufklappkarte
        stand={stand}
        farbe="gruen"
        zustand={kaputt ? "kaputt" : laufen > 0 ? "laeuft" : "fertig"}
        titel={kaputt ? "Etwas ist kaputt" : laufen > 0 ? `${laufen} ${laufen === 1 ? "läuft" : "laufen"} gerade` : "Gerade ruht alles"}
        zeile={inArbeit[0] ? `${inArbeit[0].projekt ? `${projektInfo(inArbeit[0].projekt).name}: ` : ""}${ohneKennungen(inArbeit[0].titel)}` : kaputt ? "Tippen zeigt, was hakt" : "Gerade arbeitet niemand"}
      >
        <InArbeit liste={inArbeit} jetzt={jetzt} />
        <Kette liste={kette} jetzt={jetzt} />
      </Aufklappkarte>
      <Aufklappkarte stand={stand} farbe="blau" zustand={weit.length > 0 && weit.every((w) => w.fertig >= w.gesamt) ? "fertig" : "laeuft"} titel="Wie weit sind wir?" zeile={fertigZeile(weit)}>
        <WieWeit liste={weit} />
      </Aufklappkarte>
    </main>
  );
}

export default function Home() {
  const sitzung = useSitzung();
  const angemeldet = sitzung.zustand === "ok" && sitzung.sitzung !== null;
  return (
    <Rahmen aktiv="uebersicht">
      {(quelle, jetzt, wartend, pause, laden, chef, stand) => <Start stand={stand} loopPausiert={pause.stand?.pausiert === true} quelle={quelle} jetzt={jetzt} wartend={wartend} laden={laden} pausiert={pause.stand?.pausiert ? pauseSatz(pause.stand.seit, jetzt) : null} angemeldet={angemeldet} chef={chef} />}
    </Rahmen>
  );
}
