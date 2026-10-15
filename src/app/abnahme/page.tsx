"use client";

import { staende, type Stand } from "@/lib/abnahme/abnahme";
import { projektInfo } from "@/lib/projekte";
import { zeitInWorten } from "@/lib/zeit";
import { MitMehr } from "../mit-mehr";
import { Rahmen } from "../rahmen";
import { ZustandSymbol, type ZustandArt } from "../zustand-symbol";
import "../bunt.css";

const GRUPPEN: { art: ZustandArt; farbe: string; titel: string; passt: (s: Stand) => boolean }[] = [
  { art: "kaputt", farbe: "pfirsich", titel: "Rot", passt: (s) => !s.ok },
  { art: "fertig", farbe: "blau", titel: "Läuft", passt: (s) => s.ok },
];

/** Abnahme (SIN-626): Ergebnis der stündlichen Proben aus `loop_events` (Schritt abnahme), rot zuerst. Noch keine Probe gelaufen: „Keine Daten“, nichts geraten. */
export default function Abnahme() {
  return (
    <Rahmen aktiv="abnahme">
      {(quelle, jetzt) => {
        const proben = staende(quelle.events).sort((a, b) => a.titel.localeCompare(b.titel, "de"));
        const eintrag = (s: Stand) => (
          <li key={`${s.produkt}/${s.titel}`} className="dienst-schmal">
            <span className="station-name">{s.titel}</span>
            <span className="leer">
              {projektInfo(s.produkt).name} · geprüft {zeitInWorten(new Date(s.zeit).toISOString(), jetzt) ?? "zuletzt unbekannt"}
            </span>
          </li>
        );
        return (
          <main className="einfach bunt">
            <div className="kopf-titel">
              <h1>Läuft es wirklich?</h1>
            </div>
            {proben.length === 0 ? (
              <p className="leer">Keine Daten</p>
            ) : (
              GRUPPEN.map((g) => {
                const liste = proben.filter(g.passt);
                return liste.length === 0 ? null : (
                  <section key={g.art} className={`tile einfach-block ${g.farbe}`} aria-labelledby={`abnahme-${g.art}`}>
                    <h2 id={`abnahme-${g.art}`} className="karte-titel">
                      {g.titel}
                    </h2>
                    <ZustandSymbol art={g.art} />
                    <MitMehr liste={liste} klasse="fortschritt" zeile={eintrag} />
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
