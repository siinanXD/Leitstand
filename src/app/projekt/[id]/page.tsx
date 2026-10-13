"use client";

import Link from "next/link";
import { use } from "react";
import { projektInfo } from "@/lib/projekte";
import { alsNaechstes, projektAufgaben, projektLinks } from "@/lib/projektseite";
import { fortschritt } from "@/lib/uebersicht-einfach";
import { ohneKennungen } from "@/lib/zeit";
import { ChefZeile } from "../../chef-karte";
import { WieWeit } from "../../fortschritt-balken";
import { MitMehr } from "../../mit-mehr";
import { Rahmen } from "../../rahmen";
import { ZustandSymbol } from "../../zustand-symbol";
import "../../bunt.css";

/** Ein Produkt (SIN-578): drei Karten, Fortschritt, als Nächstes, deine Aufgaben. Kennungen und Minuten nur auf der Aufgaben-Seite. */
export default function ProjektSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projekt = projektInfo(decodeURIComponent(id));
  return (
    <Rahmen aktiv="projekte">
      {(quelle, _jetzt, _wartend, _pause, _laden, chef) => {
        // Aus Linear: was gerade läuft, dann was als Nächstes dran ist (Befund 13.10.: hier stand nur „Keine Daten“).
        const ausLinear = (quelle.aufgaben ?? []).filter((a) => a.projekt === projekt.id && (a.status === "laeuft" || (a.status === "offen" && a.labels.includes("claude"))));
        const naechstes = ausLinear.length > 0 ? [...ausLinear].sort((a, b) => Number(b.status === "laeuft") - Number(a.status === "laeuft")).map((a) => (a.status === "laeuft" ? `Gerade: ${a.titel}` : a.titel)) : alsNaechstes(quelle.snapshot, projekt.id);
        const aufgaben = projektAufgaben(quelle.snapshot, projekt.id);
        const weit = fortschritt(quelle).filter((f) => f.project === projekt.id && f.gesamt > 0);
        return (
          <main className="einfach bunt">
            <section className="einfach-lage" aria-labelledby="projekt">
              <h1 id="projekt" className="satz">
                <Link href="/projekte">Produkte</Link> · <span className="marke-projekt" style={{ background: projekt.farbe }} aria-hidden="true" /> {projekt.name}
              </h1>
              <ChefZeile angemeldet zeilen={chef} snapshot={quelle.snapshot} />
              <ul className="link-leiste" aria-label="Links">
                {projektLinks(projekt).flatMap((l) =>
                  l.href
                    ? [
                        <li key={l.art}>
                          <a href={l.href} target="_blank" rel="noreferrer">
                            {l.name}
                          </a>
                        </li>,
                      ]
                    : [],
                )}
              </ul>
            </section>

            <section className="tile einfach-block pfirsich" aria-labelledby="weit">
              <h2 id="weit" className="karte-titel">
                Wie weit sind wir?
              </h2>
              <ZustandSymbol art={weit.length > 0 && weit.every((w) => w.fertig >= w.gesamt) ? "fertig" : "laeuft"} />
              <WieWeit liste={weit} />
            </section>

            <section className="tile einfach-block gruen" aria-labelledby="naechstes">
              <h2 id="naechstes" className="karte-titel">
                Als Nächstes
              </h2>
              <ZustandSymbol art="laeuft" />
              {naechstes.length === 0 ? (
                <p className="leer">Gerade ist nichts geplant.</p>
              ) : (
                <MitMehr
                  liste={naechstes}
                  klasse="aufgaben"
                  zeile={(t) => (
                    <li key={t}>
                      <span>{ohneKennungen(t)}</span>
                    </li>
                  )}
                />
              )}
            </section>

            <section className="tile einfach-block sonne" aria-labelledby="deine">
              <h2 id="deine" className="karte-titel">
                {aufgaben.length > 0 ? `${aufgaben.length} ${aufgaben.length === 1 ? "Aufgabe wartet" : "Aufgaben warten"} auf dich` : "Nichts wartet auf dich"}
              </h2>
              <ZustandSymbol art={aufgaben.length > 0 ? "wartet" : "fertig"} />
              {aufgaben.length > 0 && (
                <MitMehr
                  liste={aufgaben}
                  klasse="aufgaben"
                  zeile={(a) => (
                    <li key={a.key}>
                      {/^SIN-\d+$/.test(a.ref) ? <Link href={`/aufgabe/${a.ref}`}>{ohneKennungen(a.titel)}</Link> : <span>{ohneKennungen(a.titel)}</span>}
                    </li>
                  )}
                />
              )}
            </section>
          </main>
        );
      }}
    </Rahmen>
  );
}
