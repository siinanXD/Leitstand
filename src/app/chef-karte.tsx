"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/browser-client";
import { letzteJeProdukt, type Zeile } from "@/lib/ceo/ceo";
import { projektInfo } from "@/lib/projekte";

/** „Der Chef sagt“ (SIN-542, SIN-568): eine Zeile unter dem Titel mit der letzten Entscheidung des CEO-Agenten aus `ceo_entscheidungen`. Ohne Zeilen oder Tabelle: ehrlicher Leerzustand. */
export function ChefZeile({ angemeldet }: { angemeldet: boolean }) {
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
  const neueste = zeilen?.[0];
  const text = zeilen === undefined ? "Wird geladen …" : neueste ? `${projektInfo(neueste.produkt).name}: ${neueste.grund}` : "Noch keine Entscheidung.";
  return (
    <p className="chef-zeile" title={text}>
      <span className="mono-label">Der Chef sagt</span> {text}
    </p>
  );
}
