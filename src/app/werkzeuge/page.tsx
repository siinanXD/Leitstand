"use client";

import { useSitzung } from "@/lib/sitzung";
import { ohneKennungen, zeitInWorten } from "@/lib/zeit";
import { useWerkzeuge } from "@/lib/werkzeuge-client";
import type { Zeile } from "@/lib/werkzeuge/werkzeuge";
import { MitMehr } from "../mit-mehr";
import { Rahmen } from "../rahmen";
import { ZustandSymbol, type ZustandArt } from "../zustand-symbol";
import "../bunt.css";

const GRUPPEN: { art: ZustandArt; farbe: string; titel: string; passt: (z: Zeile) => boolean }[] = [
  { art: "kaputt", farbe: "pfirsich", titel: "Kaputt", passt: (z) => z.ok === false },
  { art: "wartet", farbe: "sonne", titel: "Noch nicht geprüft", passt: (z) => z.ok === null },
  { art: "fertig", farbe: "blau", titel: "Läuft alles", passt: (z) => z.ok === true },
];

const werkzeug = (jetzt: Date) =>
  function Eintrag(z: Zeile) {
    const zuletzt = z.letzteOkAt ? zeitInWorten(z.letzteOkAt, jetzt) : null;
    return (
      <li key={z.id} className="dienst-schmal">
        <span className="station-name">{z.name}</span>
        <span className="leer">{ohneKennungen(z.aufgabe)}</span>
        <span className="leer">
          {zuletzt ? `Zuletzt verbunden: ${zuletzt}` : "Noch nie verbunden"}
        </span>
      </li>
    );
  };

/** Werkzeuge (SIN-544, SIN-578, Figma W3 v2 81:89): drei Karten nach Zustand, je höchstens drei Werkzeuge, Rest hinter „mehr“. Zeit nur in Worten. */
export default function Werkzeuge() {
  const sitzung = useSitzung();
  const stand = useWerkzeuge(sitzung.zustand === "ok" && sitzung.sitzung !== null);
  return (
    <Rahmen aktiv="werkzeuge">
      {(_quelle, jetzt) => {
        const zeilen = stand.zustand === "ok" ? stand.zeilen : [];
        return (
          <main className="einfach bunt">
            <div className="kopf-titel">
              <h1>Werkzeuge</h1>
            </div>
            {stand.zustand !== "ok" ? (
              <p className="leer">{stand.zustand === "laedt" ? "Wird geladen …" : "Keine Daten"}</p>
            ) : (
              GRUPPEN.map((g) => {
                const liste = zeilen.filter(g.passt);
                return liste.length === 0 ? null : (
                  <section key={g.art} className={`tile einfach-block ${g.farbe}`} aria-labelledby={`werkzeuge-${g.art}`}>
                    <h2 id={`werkzeuge-${g.art}`} className="karte-titel">
                      {g.titel}
                    </h2>
                    <ZustandSymbol art={g.art} />
                    <MitMehr liste={liste} klasse="fortschritt" zeile={werkzeug(jetzt)} />
                  </section>
                );
              })
            )}
          </main>
        );
      }}
    </Rahmen>
  );
}
