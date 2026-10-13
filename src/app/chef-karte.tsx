"use client";

import { useEffect, useState } from "react";
import { sendeGo } from "@/lib/aktionen-client";
import { browserClient } from "@/lib/browser-client";
import { letzteJeProdukt, type Zeile } from "@/lib/ceo/ceo";
import { platzReihenfolge, projektInfo } from "@/lib/projekte";
import { goSatz, SCHRITT, staende, type Stand } from "@/lib/visionaer/visionaer";
import { ohneKennungen } from "@/lib/zeit";

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
  // Vorschläge des Visionärs, die auf Sinans „go“ warten (SIN-573).
  const [vorschlaege, setVorschlaege] = useState<Stand[]>([]);
  const [gesendet, setGesendet] = useState<string[]>([]);
  const [fehler, setFehler] = useState(false);
  useEffect(() => {
    const client = browserClient();
    if (!angemeldet || !client) return;
    let offen = true;
    void Promise.resolve(client.from("loop_events").select("project, step, status, grund, created_at").eq("step", SCHRITT).order("created_at", { ascending: false }).limit(50)).then(({ data, error }) => {
      if (offen && !error) setVorschlaege(staende(data).filter((s) => s.status === "vorschlag"));
    });
    return () => {
      offen = false;
    };
  }, [angemeldet]);
  async function go(produkt: string) {
    setFehler(false);
    if (await sendeGo(produkt)) setGesendet((g) => [...g, produkt]);
    else setFehler(true);
  }
  // Eine Zeile je Produkt, Projekte in Bauphase (Leitstand) zuerst.
  const reihe = platzReihenfolge(zeilen?.map((z) => z.produkt) ?? []);
  const sortiert = reihe.flatMap((id) => zeilen?.find((z) => z.produkt === id) ?? []);
  const texte = zeilen === undefined ? ["Wird geladen …"] : sortiert.length ? sortiert.map((z) => (z.grund.startsWith(`${projektInfo(z.produkt).name}:`) ? z.grund : `${projektInfo(z.produkt).name}: ${z.grund}`)) : ["Noch keine Entscheidung."];
  // Ein Satz je Produkt (SIN-578), höchstens drei sichtbar, der Rest hinter „mehr“.
  const zeile = (text: string, i: number) => (
    <p key={text} className="chef-zeile" title={text}>
      {i === 0 && <span className="mono-label">Der Chef sagt </span>}
      {ohneKennungen(text)}
    </p>
  );
  return (
    <div>
      {vorschlaege.map((v) => (
        <p key={v.produkt} className="chef-zeile">
          {gesendet.includes(v.produkt) ? `${projektInfo(v.produkt).name}: ${v.name} ist freigegeben.` : goSatz(projektInfo(v.produkt).name, v.name)}{" "}
          {!gesendet.includes(v.produkt) && (
            <button type="button" className="knopf" onClick={() => void go(v.produkt)}>
              Go
            </button>
          )}
        </p>
      ))}
      {fehler && (
        <p className="chef-zeile" role="alert">
          Go konnte nicht gespeichert werden.
        </p>
      )}
      {texte.slice(0, 3).map(zeile)}
      {texte.length > 3 && (
        <details className="mehr">
          <summary>mehr</summary>
          {texte.slice(3).map(zeile)}
        </details>
      )}
    </div>
  );
}
