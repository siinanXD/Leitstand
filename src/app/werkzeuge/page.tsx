"use client";

import { useSitzung } from "@/lib/sitzung";
import { useWerkzeuge } from "@/lib/werkzeuge-client";
import { Rahmen } from "../rahmen";
import "../einfach.css";
import "../bunt.css";

const wann = (iso: string | null) => (iso ? new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" }) : "noch nie");

/** Werkzeuge (SIN-544): je Tool Punkt grün/rot, letzte erfolgreiche Verbindung, ein Satz. Status steht für Farbe und Text, nie nur für Farbe. */
export default function Werkzeuge() {
  const sitzung = useSitzung();
  const stand = useWerkzeuge(sitzung.zustand === "ok" && sitzung.sitzung !== null);
  return (
    <Rahmen aktiv="werkzeuge">
      {() => (
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
              <ul className="fortschritt">
                {stand.zeilen.map((z) => (
                  <li key={z.id}>
                    <div className="zeile">
                      <span>
                        <span className={z.ok === null ? "punkt" : z.ok ? "punkt aktiv" : "punkt rot"} aria-hidden="true" /> {z.name}
                      </span>
                      <span className="mono">{z.ok === null ? "nicht geprüft" : z.ok ? "verbunden" : "gestört"}</span>
                    </div>
                    <p className="leer">{z.aufgabe}</p>
                    <p className="leer">
                      Letzte erfolgreiche Verbindung: <span className="mono">{wann(z.letzteOkAt)}</span>
                      {z.ok === false && z.hinweis ? ` · ${z.hinweis}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      )}
    </Rahmen>
  );
}
