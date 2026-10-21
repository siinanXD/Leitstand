"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/browser-client";
import { berlinerTag } from "@/lib/berlin";
import type { Eingriff, Haengt } from "@/lib/kennzahlen/durchstich";

type Zeile = { durchstich: { tag: string; liste: string[]; quote: number | null } | null; mit_eingriff: Eingriff[] | null; haengt: Haengt[] | null };

/** „Heute ohne dich fertig: N“ (SIN-897). Nur die Zeile `leitstand` aus loop_snapshot; ein Wert von gestern zählt nicht als heute. */
export function DurchstichKachel({ angemeldet, jetzt }: { angemeldet: boolean; jetzt: Date }) {
  const [zeile, setZeile] = useState<Zeile | null | undefined>(undefined);
  useEffect(() => {
    const client = browserClient();
    if (!angemeldet || !client) return;
    let offen = true;
    void Promise.resolve(client.from("loop_snapshot").select("durchstich,mit_eingriff,haengt").eq("project", "leitstand").maybeSingle()).then(({ data, error }) => {
      if (offen) setZeile(error ? null : ((data as Zeile | null) ?? null));
    });
    return () => {
      offen = false;
    };
  }, [angemeldet]);
  const heute = zeile?.durchstich?.tag === berlinerTag(jetzt);
  const liste = heute ? zeile!.durchstich!.liste : [];
  return (
    <details className="tile einfach-block">
      <summary>
        <span className="mono-label">Heute ohne dich fertig</span>{" "}
        <span className="mono">{zeile === undefined ? "…" : zeile === null ? "Nicht lesbar" : heute ? liste.length : "Keine Zahl"}</span>
      </summary>
      {heute && (
        <>
          <p>{liste.length ? liste.join(", ") : "Noch keins ohne dich fertig."}</p>
          {(zeile!.mit_eingriff ?? []).length > 0 && <p className="leer">Mit Eingriff: {zeile!.mit_eingriff!.map((m) => `${m.kennung} (${m.eingriffe.join(", ")})`).join("; ")}</p>}
          {(zeile!.haengt ?? []).length > 0 && <p className="leer">Hängt: {zeile!.haengt!.map((h) => `${h.kennung} seit ${Math.floor(h.seitMin / 60)} h${h.grund ? `, ${h.grund}` : ""}`).join("; ")}</p>}
        </>
      )}
    </details>
  );
}
