"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/browser-client";
import { alle, zahlText, type Reihe, type WochenZeile } from "@/lib/kennzahlen/kennzahlen";

/** Wochenverlauf als Säulen: Höhe relativ zum größten Wert der Reihe; Wochen ohne Zahl bleiben leer. */
function Verlauf({ r }: { r: Reihe }) {
  const werte = r.punkte.map((p) => p.wert);
  const max = Math.max(...werte.map((w) => w ?? 0), 0.0001);
  return (
    <svg viewBox="0 0 80 24" width="100%" height="24" role="img" aria-label={`${r.name}, 8 Wochen: ${r.punkte.map((p) => (p.wert === null ? "keine Zahl" : zahlText({ ...r, aktuell: p.wert }))).join(", ")}`}>
      {werte.map((w, i) => (
        <rect key={r.punkte[i].woche} x={i * 10 + 1} y={w === null ? 22 : 24 - Math.max(2, (w / max) * 22)} width="8" height={w === null ? 2 : Math.max(2, (w / max) * 22)} fill={w === null ? "var(--color-border-subtle)" : "var(--color-accent-primary)"} />
      ))}
    </svg>
  );
}

/** Drei Kennzahlen ganz oben (SIN-630): Wort und Zahl, darunter 8 Wochen Verlauf. Nur echte Zeilen aus `kennzahlen_woche`. */
export function KennzahlenKachel({ angemeldet, jetzt }: { angemeldet: boolean; jetzt: Date }) {
  const [zeilen, setZeilen] = useState<WochenZeile[] | null | undefined>(undefined);
  useEffect(() => {
    const client = browserClient();
    if (!angemeldet || !client) return;
    let offen = true;
    void Promise.resolve(client.from("kennzahlen_woche").select("kennzahl,woche,zaehler,nenner").eq("produkt", "maf").order("woche", { ascending: false }).limit(60)).then(({ data, error }) => {
      if (offen) setZeilen(error ? null : ((data ?? []) as WochenZeile[]));
    });
    return () => {
      offen = false;
    };
  }, [angemeldet]);
  const reihen = zeilen ? alle(zeilen, jetzt) : null;
  return (
    <section className="einfach-lage" aria-labelledby="kennzahlen">
      <h2 id="kennzahlen" className="mono-label">
        Was zählt (8 Wochen)
      </h2>
      {zeilen === undefined ? (
        <p className="leer">Zahlen werden gelesen …</p>
      ) : reihen === null ? (
        <p className="leer">Nicht lesbar</p>
      ) : (
        reihen.map((r) => (
          <div key={r.kennzahl} className="tile einfach-block">
            <p className="summe">
              <span className="mono-label">{r.name}</span>
              <span className="mono">{zahlText(r)}</span>
            </p>
            <Verlauf r={r} />
          </div>
        ))
      )}
    </section>
  );
}
