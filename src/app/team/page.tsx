"use client";

import { agentKarte, bahnen } from "@/lib/agenten";
import { projekteIn, Rahmen } from "../rahmen";
import "../einfach.css";
import "../bunt.css";

const ZUSTAND: Record<string, string> = { laeuft: "arbeitet", ok: "erledigt", warn: "wartet", error: "Fehler", leer: "keine Daten" };

/** Team nach Figma T2 (SIN-546, 59:97): ein Helfer je Agent aus dem Register. Zustand und „aktuell“ nur aus loop_events, sonst „keine Daten“. */
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
                <li key={k.id} className="helfer-karte">
                  <span className={`avatar ${k.signal}`} aria-hidden="true">
                    {k.name.slice(0, 1)}
                  </span>
                  <h2>{k.name}</h2>
                  <p className="leer">{k.auftrag}</p>
                  <p>
                    <span className="sr-only">Zustand: </span>
                    {ZUSTAND[k.signal]} · {k.aktuell}
                  </p>
                </li>
              ))}
            </ul>
          </main>
        );
      }}
    </Rahmen>
  );
}
