"use client";

import { useSitzung } from "@/lib/sitzung";
import { useWerkzeuge } from "@/lib/werkzeuge-client";
import type { Zeile } from "@/lib/werkzeuge/werkzeuge";
import { Rahmen } from "../rahmen";
import "../bunt.css";

const wann = (iso: string | null) => (iso ? new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" }) : "noch nie");


function Werkzeug({ z }: { z: Zeile }) {
  return (
    <li>
      <div className="zeile">
        <span>
          <span className={z.ok === null ? "punkt gelb" : z.ok ? "punkt aktiv" : "punkt rot"} aria-hidden="true" /> {z.name}
        </span>
        <span className="mono">{z.ok === null ? "nicht geprüft" : z.ok ? "verbunden" : "gestört"}</span>
      </div>
      <p className="leer">{z.aufgabe}</p>
      <p className="leer">
        Letzte erfolgreiche Verbindung: <span className="mono">{wann(z.letzteOkAt)}</span>
        {z.ok === false && z.hinweis ? ` · ${z.hinweis}` : ""}
      </p>
    </li>
  );
}

/** Werkzeuge (SIN-544, SIN-568): rote und gelbe oben, grüne eingeklappt als „N grün“. Status steht für Farbe und Text, nie nur für Farbe. */
export default function Werkzeuge() {
  const sitzung = useSitzung();
  const stand = useWerkzeuge(sitzung.zustand === "ok" && sitzung.sitzung !== null);
  return (
    <Rahmen aktiv="werkzeuge">
      {() => {
        const zeilen = stand.zustand === "ok" ? stand.zeilen : [];
        const gruen = zeilen.filter((z) => z.ok === true);
        const offen = zeilen.filter((z) => z.ok !== true);
        return (
          <main className="einfach bunt">
            <section className="tile einfach-block blau" aria-labelledby="werkzeuge">
              <div className="kopf-block">
                <h1 id="werkzeuge" className="mono-label">
                  Werkzeuge
                </h1>
                <p className="leer">Stündlich geprüft mit einer lesenden Anfrage je Tool. Fehlt ein Key, steht das Tool auf rot.</p>
              </div>
              {stand.zustand !== "ok" ? (
                <p className="leer">{stand.zustand === "laedt" ? "Wird geladen …" : "Keine Daten"}</p>
              ) : (
                <>
                  {offen.length === 0 ? <p className="leer">Alle Werkzeuge laufen.</p> : <ul className="fortschritt">{offen.map((z) => <Werkzeug key={z.id} z={z} />)}</ul>}
                  {gruen.length > 0 && (
                    <details className="gruen-zu">
                      <summary>{gruen.length} grün</summary>
                      <ul className="fortschritt">{gruen.map((z) => <Werkzeug key={z.id} z={z} />)}</ul>
                    </details>
                  )}
                </>
              )}
            </section>
          </main>
        );
      }}
    </Rahmen>
  );
}
