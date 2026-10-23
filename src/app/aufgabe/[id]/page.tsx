"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ablauf, aufgabeLinks, kopf, parseMeldungen, type Meldung } from "@/lib/aufgabe";
import { browserClient } from "@/lib/browser-client";
import { parseNachweis, type Ansicht } from "@/lib/nachweis";
import { projektInfo } from "@/lib/projekte";
import { ladeAufgabe, type Lesequelle } from "@/lib/supabase";
import type { Quelle } from "@/lib/uebersicht";
import { ohneKennungen, zeitInWorten } from "@/lib/zeit";
import { titelVon } from "@/lib/aufgaben";
import { verlauf } from "@/lib/verlauf";
import { MitMehr } from "../../mit-mehr";
import { Rahmen } from "../../rahmen";
import { ZustandSymbol } from "../../zustand-symbol";
import "../../bunt.css";
import "../../aufgabe.css";

const euro = (v: number) => `${v.toFixed(2).replace(".", ",")} €`;

/** Aufgabe nach Figma A5 v2 (SIN-578, 81:247): Zustand, Ablauf als Kette, zuletzt Gemeldetes. Kennung, Spur, Dauer, Kosten, Links und JSON nur eingeklappt unter „Details“. Nur Supabase. */
export default function AufgabeSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const issue = decodeURIComponent(id);
  return <Rahmen aktiv="">{(quelle, jetzt) => <Inhalt issue={issue} quelle={quelle} jetzt={jetzt} />}</Rahmen>;
}

function Inhalt({ issue, quelle, jetzt }: { issue: string; quelle: Quelle; jetzt: Date }) {
  const [roh, setRoh] = useState<unknown[] | null | undefined>(undefined);
  useEffect(() => {
    const client = browserClient();
    if (!client) return;
    let offen = true;
    void ladeAufgabe(client as unknown as Lesequelle, issue).then((r) => offen && setRoh(r));
    return () => {
      offen = false;
    };
  }, [issue]);

  if (roh === undefined) return <p className="hinweis" role="status">Ablauf wird geladen …</p>;
  if (roh === null) return <p className="hinweis" role="status">Datenquelle nicht erreichbar.</p>;

  const meldungen = parseMeldungen(roh, issue);
  const k = kopf(meldungen, quelle.snapshot, issue, jetzt);
  const schritte = ablauf(meldungen);
  const letzte: Meldung | undefined = meldungen.at(-1);
  const links = aufgabeLinks(meldungen, quelle.snapshot, issue);
  const nachweis = parseNachweis(roh, issue);
  // Titel und Stand aus Linear, Verlauf in Worten aus loop_events (Sinan 13.10.: „Da steht nur ‚Eine Aufgabe‘“).
  const aufgabe = quelle.aufgaben?.find((a) => a.issue === issue);
  const rohTitel = titelVon(quelle.aufgaben, issue) ?? k.titel;
  const titel = rohTitel ? ohneKennungen(rohTitel) : null;
  const schritteInWorten = verlauf(roh, issue);
  const start = aufgabe?.gestartet ?? meldungen[0]?.zeitpunkt ?? schritteInWorten[0]?.zeit ?? null;
  const gestartet = start ? zeitInWorten(start, jetzt) : null;
  const projekt = aufgabe?.projekt ?? k.projekt;
  const stand =
    aufgabe?.status === "fertig" ? `Fertig${aufgabe.fertig ? `, ${zeitInWorten(aufgabe.fertig, jetzt)}` : ""}` : aufgabe?.status === "laeuft" ? "Wird gerade gebaut" : aufgabe?.status === "abgebrochen" ? "Abgebrochen" : aufgabe ? "Wartet, bis sie dran ist" : null;
  const mitRollen = meldungen.length > 0;

  return (
    <main className="einfach bunt aufgabe-seite">
      <section className="tile einfach-block sonne" aria-labelledby="aufgabe">
        <p className="mono-label">
          <Link href="/">Start</Link>
        </p>
        <h1 id="aufgabe" className="karte-titel">
          {titel || "Aufgabe ohne Titel"}
        </h1>
        {stand ? <p>{stand}</p> : k.marke ? <ZustandSymbol art={k.marke} /> : null}
        <p className="leer">{[projekt && projektInfo(projekt).name, gestartet && `gestartet ${gestartet}`].filter(Boolean).join(" · ")}</p>
      </section>

      {!mitRollen && (
        <section className="tile einfach-block gruen" aria-labelledby="passiert">
          <h2 id="passiert" className="karte-titel">
            Was ist passiert?
          </h2>
          {schritteInWorten.length === 0 ? (
            <p className="leer">Noch nichts. Die Aufgabe wartet, bis ein Helfer frei ist.</p>
          ) : (
            <MitMehr
              liste={[...schritteInWorten].reverse()}
              klasse="eintraege"
              zeile={(v) => (
                <li key={v.zeit + v.satz} className="eintrag">
                  <ZustandSymbol art={v.rot ? "kaputt" : v.satz.startsWith("Fertig") ? "fertig" : "laeuft"} nurSymbol />
                  <span className="eintrag-titel">{v.anzahl > 9 ? `${v.satz} (sehr oft)` : v.anzahl > 1 ? `${v.satz} (${v.anzahl} Mal)` : v.satz}</span>
                  <span className="mono-label">{zeitInWorten(v.zeit, jetzt)}</span>
                </li>
              )}
            />
          )}
        </section>
      )}

      {mitRollen && (
        <>

      <section className="tile einfach-block gruen" aria-labelledby="ablauf">
        <h2 id="ablauf" className="karte-titel">
          Ablauf
        </h2>
        <ol className="bild-kette">
          {schritte.map((s) => (
            <li key={s.rolle} className={s.meldung ? undefined : "grau"}>
              {s.meldung ? <ZustandSymbol art={s.zustand} nurSymbol /> : <span className="glied" aria-hidden="true" />}
              <span>{s.name}</span>
              {!s.meldung && <span className="sr-only">: noch keine Meldung</span>}
            </li>
          ))}
        </ol>
      </section>

      <section className="tile einfach-block blau" aria-labelledby="gemeldet">
        <h2 id="gemeldet" className="karte-titel">
          Zuletzt gemeldet
        </h2>
        {letzte ? (
          <>
            <p>
              <span className="station-name">{schritte.find((s) => s.meldung === letzte)?.name}</span> <span className="leer">{ohneKennungen(letzte.zusammenfassung ?? "keine Meldung")}</span>
            </p>
            {letzte.naechsterSchritt && <p className="leer">Als Nächstes: {ohneKennungen(letzte.naechsterSchritt)}</p>}
            <p className="leer">{zeitInWorten(letzte.zeitpunkt, jetzt)}</p>
          </>
        ) : (
          <p className="leer">keine Meldung</p>
        )}
      </section>
        </>
      )}

      <details className="mehr">
        <summary>Details</summary>
        <ul className="aufgabe-kopfwerte" aria-label="Eckdaten">
          <li className="mono">{k.kennung}</li>
          {k.spur && <li className="mono">Spur {k.spur}</li>}
          {k.dauerMin !== null && <li className="mono">{k.dauerMin} MIN</li>}
          {k.kostenEur !== null && <li className="mono">{euro(k.kostenEur)} bisher</li>}
        </ul>
        {schritte.some((s) => s.werkzeuge.length > 0) &&
          schritte.map(
            (s) =>
              s.werkzeuge.length > 0 && (
                <ul key={s.rolle} className="werkzeuge" aria-label={`Werkzeuge ${s.name}`}>
                  {s.werkzeuge.map((w) => (
                    <li key={w} className="mono">
                      {w}
                    </li>
                  ))}
                </ul>
              ),
          )}
        {schritte.map(
          (s) =>
            s.meldung?.zusammenfassung && (
              <p key={s.rolle}>
                <span className="station-name">{s.name}</span> <span className="leer">{s.satz}</span>
              </p>
            ),
        )}
        {nachweis && (
          <div className="nachweis" aria-label="Was sich geändert hat">
            {nachweis.diff && <p>{nachweis.diff}</p>}
            <ul className="nachweis-routen" aria-label="Routen">
              {nachweis.routen.map((r) => (
                <li key={r.route}>
                  <h3 className="mono">{r.route}</h3>
                  <div className="nachweis-paar">
                    <Bilder titel="Vorher" route={r.route} a={r.vorher} />
                    <Bilder titel="Nachher" route={r.route} a={r.nachher} />
                  </div>
                </li>
              ))}
            </ul>
            {nachweis.clip && (
              <video controls preload="none" src={nachweis.clip} aria-label="Klickweg als Clip">
                <a href={nachweis.clip}>Clip öffnen</a>
              </video>
            )}
            {nachweis.dateien.length > 0 && (
              <ul aria-label="Geänderte Dateien">
                {nachweis.dateien.map((d) => (
                  <li key={d.datei}>
                    <span className="mono">{d.datei}</span> <span className="leer">{d.was ?? ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <ul className="link-leiste" aria-label="Links">
          {links.map((l) => (
            <li key={l.name}>
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
        {letzte && (
          <details>
            <summary className="knopf">JSON anzeigen</summary>
            <pre className="mono json">{JSON.stringify(letzte.roh, null, 2)}</pre>
          </details>
        )}
      </details>
    </main>
  );
}

/** Handy zuerst, dann Desktop; eine fehlende Ansicht wird nicht ersetzt. */
function Bilder({ titel, route, a }: { titel: string; route: string; a: Ansicht }) {
  return (
    <figure>
      <figcaption className="mono-label">{titel}</figcaption>
      {/* eslint-disable-next-line @next/next/no-img-element -- Nachweise liegen in Supabase Storage, keine Next-Bildoptimierung */}
      {a.handy ? <img src={a.handy} alt={`${titel}, Handy, ${route}`} loading="lazy" /> : <p className="leer">kein Handy-Bild</p>}
      {/* eslint-disable-next-line @next/next/no-img-element -- siehe oben */}
      {a.desktop ? <img src={a.desktop} alt={`${titel}, Desktop, ${route}`} loading="lazy" /> : <p className="leer">kein Desktop-Bild</p>}
    </figure>
  );
}
