"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/browser-client";
import { letzteJeProdukt, type Zeile } from "@/lib/ceo/ceo";
import { projektInfo } from "@/lib/projekte";

/** Karte „Der Chef sagt“ (SIN-542): die letzte Entscheidung des CEO-Agenten je Produkt, aus `ceo_entscheidungen`. Ohne Zeilen oder Tabelle: ehrlicher Leerzustand. */
export function ChefKarte({ angemeldet }: { angemeldet: boolean }) {
  const [zeilen, setZeilen] = useState<Zeile[] | null | undefined>(undefined);
  useEffect(() => {
    const client = browserClient();
    if (!angemeldet || !client) return;
    let offen = true;
    void Promise.resolve(client.from("ceo_entscheidungen").select("produkt, entscheidung, grund, created_at").order("created_at", { ascending: false }).limit(50)).then(({ data, error }) => {
      if (offen) setZeilen(error ? null : letzteJeProdukt(data));
    });
    return () => {
      offen = false;
    };
  }, [angemeldet]);
  return (
    <section className="tile einfach-block" aria-labelledby="chef">
      <div className="kopf-block">
        <h2 id="chef" className="mono-label">
          Der Chef sagt
        </h2>
        <p className="leer">Was als Nächstes passiert und warum.</p>
      </div>
      {zeilen === undefined ? (
        <p className="leer">Wird geladen …</p>
      ) : !zeilen || zeilen.length === 0 ? (
        <p className="leer">Noch keine Entscheidung.</p>
      ) : (
        <ul className="posten">
          {zeilen.map((z) => (
            <li key={z.produkt} className="zeile">
              <span>{z.grund}</span>
              <span className="mono">{projektInfo(z.produkt).name}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
