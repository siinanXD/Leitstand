"use client";

import { agentKarte, bahnen } from "@/lib/agenten";
import { projekteIn, Rahmen } from "../rahmen";
import "../bunt.css";

const ZUSTAND: Record<string, string> = { laeuft: "arbeitet", ok: "erledigt", warn: "wartet", error: "Fehler", leer: "keine Daten" };

/** Team nach Figma T2 (SIN-546, 59:97): ein Helfer je Agent aus dem Register. Zustand und „aktuell“ nur aus loop_events, sonst „keine Daten“. Das Raster passt auf einen Bildschirm, Auftrag und „aktuell“ klappen beim Antippen auf (SIN-568). */
export default function Team() {
  return (
    <Rahmen aktiv="team">
      {(quelle, jetzt) => {
        const karten = bahnen(quelle.events, quelle.snapshot, projekteIn(quelle).map((p) => p.id), jetzt.getTime()).map((b) => agentKarte(b, jetzt.getTime()));
        const aktiv = karten.filter((k) => k.signal === "laeuft").length;
        return (
          <main className="einfach bunt">
            <div className="kopf-titel">
              <p>
                {karten.length} Helfer, {aktiv} {aktiv === 1 ? "arbeitet" : "arbeiten"} gerade
              </p>
              <h1>Mein Team</h1>
            </div>
            <ul className="helfer">
              {karten.map((k) => (
                <li key={k.id}>
                  <details className="helfer-karte">
                    <summary>
                      <span className={`avatar ${k.signal}`} aria-hidden="true">
                        {k.name.slice(0, 1)}
                      </span>
                      <h2>{k.name}</h2>
                      <span>{ZUSTAND[k.signal]}</span>
                    </summary>
                    <div className="aufklapp-inhalt">
                      <p className="leer">{k.auftrag}</p>
                      <p>{k.aktuell}</p>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </main>
        );
      }}
    </Rahmen>
  );
}
