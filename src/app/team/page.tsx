"use client";

import { agentKarte, bahnen, type AgentKarte } from "@/lib/agenten";
import { ohneKennungen } from "@/lib/zeit";
import { MitMehr } from "../mit-mehr";
import { projekteIn, Rahmen } from "../rahmen";
import { ZustandSymbol, type ZustandArt } from "../zustand-symbol";
import "../bunt.css";

const ZUSTAND: Record<AgentKarte["signal"], ZustandArt> = { laeuft: "laeuft", warn: "wartet", error: "kaputt", ok: "fertig", leer: "fertig" };
const GRUPPEN: { art: ZustandArt; farbe: string; titel: (n: number) => string }[] = [
  { art: "kaputt", farbe: "pfirsich", titel: (n) => (n === 1 ? "Einer ist kaputt" : "Einige sind kaputt") },
  { art: "wartet", farbe: "sonne", titel: (n) => (n === 1 ? "Einer wartet auf dich" : `${n} warten auf dich`) },
  { art: "laeuft", farbe: "gruen", titel: (n) => (n === 1 ? "Einer arbeitet gerade" : `${n} arbeiten gerade`) },
];

/** Team nach Figma T2 v2 (SIN-578, 81:10): Figuren statt Tabelle, je Zustand eine Karte, höchstens drei Figuren, Rest hinter „mehr“. Wer ruht, steht in einer Zeile darunter. Zustand nur aus loop_events. */
export default function Team() {
  return (
    <Rahmen aktiv="team">
      {(quelle, jetzt) => {
        const karten = bahnen(quelle.events, quelle.snapshot, projekteIn(quelle).map((p) => p.id), jetzt.getTime()).map((b) => agentKarte(b, jetzt.getTime()));
        const figur = (k: AgentKarte) => (
          <li key={k.id} title={ohneKennungen(k.auftrag)}>
            <span className={`avatar ${k.signal}`} aria-hidden="true">
              {k.name.slice(0, 1)}
            </span>
            <span>{k.name}</span>
          </li>
        );
        const ruhen = karten.filter((k) => ZUSTAND[k.signal] === "fertig");
        return (
          <main className="einfach bunt">
            <div className="kopf-titel">
              <h1>Mein Team</h1>
            </div>
            {GRUPPEN.map((g) => {
              const liste = karten.filter((k) => ZUSTAND[k.signal] === g.art);
              return liste.length === 0 ? null : (
                <section key={g.art} className={`tile einfach-block ${g.farbe}`} aria-labelledby={`team-${g.art}`}>
                  <h2 id={`team-${g.art}`} className="karte-titel">
                    {g.titel(liste.length)}
                  </h2>
                  <ZustandSymbol art={g.art} />
                  <MitMehr liste={liste} klasse="figuren" zeile={figur} />
                </section>
              );
            })}
            {ruhen.length > 0 && (
              <section aria-labelledby="team-fertig">
                <h2 id="team-fertig" className="karte-titel">
                  <ZustandSymbol art="fertig" /> Die anderen ruhen gerade
                </h2>
                <MitMehr liste={ruhen} klasse="figuren" zeile={figur} />
              </section>
            )}
          </main>
        );
      }}
    </Rahmen>
  );
}
