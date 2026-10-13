"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ablauf, aufgabeLinks, kopf, parseMeldungen, ZUSTAND_NAME, type Meldung } from "@/lib/aufgabe";
import { browserClient } from "@/lib/browser-client";
import { projektInfo } from "@/lib/projekte";
import { ladeAufgabe, type Lesequelle } from "@/lib/supabase";
import type { Quelle } from "@/lib/uebersicht";
import { Rahmen } from "../../rahmen";
import "../../einfach.css";
import "../../aufgabe.css";

const euro = (v: number) => `${v.toFixed(2).replace(".", ",")} €`;

/** Aufgabe nach Figma A5 (SIN-556): Kopf, Ablauf der Rollen, zuletzt Gemeldetes, Links. Nur Supabase. */
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

  return (
    <main className="bento-b1 aufgabe-seite">
      <section className="tile einfach-block" aria-labelledby="aufgabe" style={{ gridColumn: "1 / -1" }}>
        <div className="kopf-block">
          <p className="mono-label">
            <Link href="/">Start</Link>
          </p>
          <h1 id="aufgabe" className="karte-titel">
            <span className="mono">{k.kennung}</span>
            {k.titel && <> · {k.titel}</>}
          </h1>
        </div>
        <ul className="aufgabe-kopfwerte" aria-label="Eckdaten">
          <li>{k.marke ? <span className={`zustand ${k.marke}`}>{ZUSTAND_NAME[k.marke]}</span> : <span className="leer">keine Meldung</span>}</li>
          {k.projekt && <li className="mono">{projektInfo(k.projekt).name}</li>}
          {k.spur && <li className="mono">Spur {k.spur}</li>}
          {k.dauerMin !== null && <li className="mono">{k.dauerMin} MIN</li>}
          {k.kostenEur !== null && <li className="mono">{euro(k.kostenEur)} bisher</li>}
        </ul>
      </section>

      <section className="tile einfach-block" aria-labelledby="ablauf" style={{ gridColumn: "1 / -1" }}>
        <h2 id="ablauf" className="mono-label">
          Ablauf
        </h2>
        <ol className="kette">
          {schritte.map((s, i) => (
            <li key={s.rolle} className={s.meldung ? "station" : "station grau"}>
              <div className="station-kopf">
                <span className="kreis mono" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="station-name">{s.name}</span>
                <span className={`zustand ${s.zustand}`}>{ZUSTAND_NAME[s.zustand]}</span>
              </div>
              <p className={s.meldung?.zusammenfassung ? undefined : "leer"}>{s.satz}</p>
              {s.werkzeuge.length > 0 && (
                <ul className="werkzeuge" aria-label={`Werkzeuge ${s.name}`}>
                  {s.werkzeuge.map((w) => (
                    <li key={w} className="mono">
                      {w}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="tile einfach-block" aria-labelledby="gemeldet">
        <h2 id="gemeldet" className="mono-label">
          Zuletzt gemeldet
        </h2>
        {letzte ? (
          <>
            <p>
              <span className="station-name">{schritte.find((s) => s.meldung === letzte)?.name}</span> <span className="leer">{letzte.zusammenfassung ?? "keine Meldung"}</span>
            </p>
            {letzte.naechsterSchritt && <p className="mono-label">Nächster Schritt: {letzte.naechsterSchritt}</p>}
            <details>
              <summary className="knopf">JSON anzeigen</summary>
              <pre className="mono json">{JSON.stringify(letzte.roh, null, 2)}</pre>
            </details>
          </>
        ) : (
          <p className="leer">keine Meldung</p>
        )}
      </section>

      <section className="tile einfach-block" aria-labelledby="links">
        <h2 id="links" className="mono-label">
          Links
        </h2>
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
      </section>
    </main>
  );
}
