"use client";

import Link from "next/link";
import { PROJEKTE, alleProjekte, projektInfo } from "@/lib/projekte";
import { fortschritt } from "@/lib/uebersicht-einfach";
import { alleZeilen } from "@/lib/projektseite";
import { ChefZeile } from "../chef-karte";
import { HeuteFertig } from "../fertig-karte";
import { WieWeit } from "../fortschritt-balken";
import { MitMehr } from "../mit-mehr";
import { projekteIn, Rahmen } from "../rahmen";
import { ZustandSymbol } from "../zustand-symbol";
import "./projekte.css";
import "../bunt.css";

/** Stufen der Kette in Worten (SIN-578); unbekannte Stufen zeigen ihren Namen klein geschrieben. */
const STUFE: Record<string, string> = { PLAN: "Planen", QUEUE: "Warten", WORK: "Bauen", PR: "Prüfen", GATE: "Freigeben", MERGE: "Zusammenführen", DEPLOY: "Veröffentlichen" };

/** Produkt nach Figma P4 v2 (SIN-578, 81:173): ein Satz je Produkt, dann Fortschritt, Kette und „Zuletzt geschafft“ als drei Karten, ohne Tabelle. Alles aus loop_events und loop_snapshot. */
export default function Projekte() {
  return (
    <Rahmen aktiv="projekte">
      {(quelle, jetzt, _wartend, _pause, _laden, chef) => {
        const projekte = alleProjekte([...PROJEKTE.map((p) => p.id), ...projekteIn(quelle).map((p) => p.id)]);
        const zeilen = alleZeilen(quelle, projekte, jetzt).filter((z) => z.kette.length > 0);
        const kaputt = zeilen.some((z) => z.kette.some((s) => s.zustand === "rot"));
        return (
          <main className="einfach bunt">
            <section className="einfach-lage" aria-labelledby="alle">
              <h1 id="alle" className="satz">
                Meine Produkte
              </h1>
              <ChefZeile angemeldet zeilen={chef} snapshot={quelle.snapshot} />
            </section>

            <section className="tile einfach-block pfirsich" aria-labelledby="weit">
              <h2 id="weit" className="karte-titel">
                Wie weit sind wir?
              </h2>
              <ZustandSymbol art="fertig" />
              <WieWeit liste={fortschritt(quelle)} />
            </section>

            <section className="tile einfach-block gruen" aria-labelledby="kette">
              <h2 id="kette" className="karte-titel">
                Wo steckt jedes Produkt?
              </h2>
              <ZustandSymbol art={kaputt ? "kaputt" : "laeuft"} />
              {zeilen.length === 0 ? (
                <p className="leer">Keine Daten</p>
              ) : (
                <MitMehr
                  liste={zeilen}
                  klasse="fortschritt"
                  zeile={(z) => (
                    <li key={z.projekt.id} className="dienst-schmal">
                      <Link href={`/projekt/${z.projekt.id}`} className="projekt-name">
                        <span className="marke-projekt" style={{ background: z.projekt.farbe }} aria-hidden="true" /> {projektInfo(z.projekt.id).name}
                      </Link>
                      <ol className="bild-kette">
                        {z.kette.map((s) => (
                          <li key={s.stage}>
                            <span className={s.zustand === "rot" ? "glied rot" : s.zustand === "leer" ? "glied" : "glied voll"} aria-hidden="true" />
                            <span>{STUFE[s.stage.toUpperCase()] ?? s.stage.toLowerCase()}</span>
                            {s.zustand === "rot" && <span className="sr-only"> kaputt</span>}
                          </li>
                        ))}
                      </ol>
                    </li>
                  )}
                />
              )}
            </section>

            <HeuteFertig quelle={quelle} jetzt={jetzt} />
          </main>
        );
      }}
    </Rahmen>
  );
}
