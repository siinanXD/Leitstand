"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/browser-client";
import { letzteJeProdukt, type Zeile } from "@/lib/ceo/ceo";
import { platzReihenfolge, projektInfo } from "@/lib/projekte";

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
  // Eine Zeile je Produkt, Projekte in Bauphase (Leitstand) zuerst.
  const reihe = platzReihenfolge(zeilen?.map((z) => z.produkt) ?? []);
  const sortiert = reihe.flatMap((id) => zeilen?.find((z) => z.produkt === id) ?? []);
  const texte = zeilen === undefined ? ["Wird geladen …"] : sortiert.length ? sortiert.map((z) => (z.grund.startsWith(`${projektInfo(z.produkt).name}:`) ? z.grund : `${projektInfo(z.produkt).name}: ${z.grund}`)) : ["Noch keine Entscheidung."];
  return (
    <div>
      {texte.map((text, i) => (
        <p key={text} className="chef-zeile" title={text}>
          {i === 0 && <span className="mono-label">Der Chef sagt </span>}
          {text}
        </p>
      ))}
    </div>
  );
}
